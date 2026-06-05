import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import * as path from 'path'
import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import * as schema from '../../db/schema'
import { activities, userProfile } from '../../db/schema'
import { importBackup, type Db } from './importBackup'

// ── In-memory DB harness ────────────────────────────────────────────────────
// Builds a fresh sql.js SQLite database with the subset of the schema the
// import touches, then wraps it with Drizzle exactly as the app does.

const require = createRequire(import.meta.url)

const CREATE_TABLES = `
  CREATE TABLE user_profile (
    id integer PRIMARY KEY, name text, age integer, max_hr integer, resting_hr integer,
    goal_event text, goal_finish_time text, training_days_per_week integer,
    fixed_rest_days text, injury_notes text, theme text NOT NULL DEFAULT 'dark',
    weekly_goal_km real, weekly_goal_sessions integer, daily_calorie_target integer,
    daily_protein_target_g real, daily_water_target_ml integer
  );
  CREATE TABLE hr_zones (
    id integer PRIMARY KEY AUTOINCREMENT, zone_number integer NOT NULL,
    min_hr integer NOT NULL, max_hr integer NOT NULL, label text NOT NULL
  );
  CREATE TABLE activities (
    id integer PRIMARY KEY AUTOINCREMENT, type text NOT NULL, date text NOT NULL,
    created_at integer NOT NULL, source text NOT NULL, garmin_file_name text,
    avg_hr integer, max_hr integer, duration_min real, start_time text,
    distance_km real, hr_zone_distribution text, perceived_effort integer,
    surface_type text, notes text, avg_cadence integer, bedtime text,
    wake_time text, sleep_quality integer, exercises text, type_label text,
    raw_garmin_data text
  );
  CREATE TABLE training_plans (
    id integer PRIMARY KEY AUTOINCREMENT, name text NOT NULL, goal_event text,
    goal_date text, is_active integer NOT NULL DEFAULT 1, created_at integer NOT NULL
  );
  CREATE TABLE plan_phases (
    id integer PRIMARY KEY AUTOINCREMENT,
    plan_id integer NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
    name text NOT NULL, order_index integer NOT NULL, duration_weeks integer NOT NULL
  );
  CREATE TABLE plan_weeks (
    id integer PRIMARY KEY AUTOINCREMENT,
    phase_id integer NOT NULL REFERENCES plan_phases(id) ON DELETE CASCADE,
    week_number integer NOT NULL, notes text
  );
  CREATE TABLE plan_sessions (
    id integer PRIMARY KEY AUTOINCREMENT,
    week_id integer NOT NULL REFERENCES plan_weeks(id) ON DELETE CASCADE,
    day_of_week integer NOT NULL, type text NOT NULL, target_duration_min integer,
    target_hr_zone integer, intensity_label text, coaching_note text,
    status text NOT NULL DEFAULT 'planned',
    linked_activity_id integer REFERENCES activities(id) ON DELETE SET NULL,
    completed_at integer, completion_note text
  );
`

async function makeDb(): Promise<Db> {
  const sqlJsMain = require.resolve('sql.js')
  const wasmPath = path.join(path.dirname(sqlJsMain), 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  const sqlDb = new SQL.Database()
  sqlDb.run('PRAGMA foreign_keys = ON')
  sqlDb.exec(CREATE_TABLES)
  return drizzle(sqlDb, { schema })
}

// A valid activity row (all NOT NULL columns present).
function activity(id: number, date: string) {
  return { id, type: 'running', date, createdAt: 1_700_000_000_000, source: 'manual' as const }
}

describe('importBackup', () => {
  let db: Db

  beforeEach(async () => {
    db = await makeDb()
    // Seed the "current" data: an original profile + two logged activities.
    db.insert(userProfile).values({ id: 1, name: 'Original', theme: 'dark' } as never).run()
    db.insert(activities).values(activity(1, '2026-05-01') as never).run()
    db.insert(activities).values(activity(2, '2026-05-02') as never).run()
  })

  it('restores all original data when an inserted row violates a constraint', () => {
    // Backup parses fine and passes shape validation, but one activity row
    // has a NULL `type`, which violates NOT NULL and throws mid-insert.
    const malformedBackup: Record<string, unknown> = {
      version: 2,
      userProfile: [{ id: 1, name: 'Imported', theme: 'light' }],
      activities: [{ id: 9, type: null, date: '2026-05-09', createdAt: 1, source: 'manual' }],
    }

    const result = importBackup(db, malformedBackup)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/previous data was restored/i)

    // The two original activities must still be present...
    const rows = db.select().from(activities).all()
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.date).sort()).toEqual(['2026-05-01', '2026-05-02'])

    // ...and the profile must NOT have been overwritten by 'Imported'.
    const profile = db.select().from(userProfile).all()
    expect(profile).toHaveLength(1)
    expect(profile[0].name).toBe('Original')
    expect(profile[0].theme).toBe('dark')
  })

  it('rejects a malformed backup before deleting anything', () => {
    const badShape: Record<string, unknown> = {
      version: 2,
      activities: 'this should be an array, not a string',
    }

    const result = importBackup(db, badShape)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/malformed/i)

    // Nothing was touched — both original activities survive.
    expect(db.select().from(activities).all()).toHaveLength(2)
    expect(db.select().from(userProfile).all()[0].name).toBe('Original')
  })

  it('rejects an unrecognised version without touching data', () => {
    const result = importBackup(db, { version: 99, activities: [] })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/version/i)
    expect(db.select().from(activities).all()).toHaveLength(2)
  })

  it('replaces data on a valid backup', () => {
    const goodBackup: Record<string, unknown> = {
      version: 2,
      userProfile: [{ id: 1, name: 'Imported', theme: 'light' }],
      activities: [activity(50, '2026-06-01')],
    }

    const result = importBackup(db, goodBackup)

    expect(result.success).toBe(true)

    const rows = db.select().from(activities).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-06-01')

    const profile = db.select().from(userProfile).all()
    expect(profile[0].name).toBe('Imported')
    expect(profile[0].theme).toBe('light')
  })
})
