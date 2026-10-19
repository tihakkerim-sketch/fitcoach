import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from './schema'
import { createDrizzle } from './nodeSqliteAdapter'
import { MIGRATIONS, runMigrations, type Migration } from './migrations'

const LATEST = Math.max(...MIGRATIONS.map(m => m.version))

/** The schema real databases had BEFORE this migration system (user_version 0). */
const LEGACY_DDL = `
  CREATE TABLE activities (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, type text NOT NULL, date text NOT NULL,
    created_at integer NOT NULL, source text NOT NULL, garmin_file_name text, avg_hr integer, max_hr integer,
    duration_min real, start_time text, distance_km real, hr_zone_distribution text, perceived_effort integer,
    surface_type text, notes text, avg_cadence integer, bedtime text, wake_time text, sleep_quality integer,
    exercises text, type_label text, raw_garmin_data text);
  CREATE TABLE coach_conversations (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, created_at integer NOT NULL,
    updated_at integer NOT NULL, title text DEFAULT 'New chat' NOT NULL);
  CREATE TABLE coach_messages (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, conversation_id integer NOT NULL,
    role text NOT NULL, content text NOT NULL, created_at integer NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES coach_conversations(id) ON UPDATE no action ON DELETE cascade);
  CREATE TABLE hr_zones (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, zone_number integer NOT NULL,
    min_hr integer NOT NULL, max_hr integer NOT NULL, label text NOT NULL);
  CREATE TABLE training_plans (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL, goal_event text,
    goal_date text, is_active integer DEFAULT 1 NOT NULL, created_at integer NOT NULL);
  CREATE TABLE plan_phases (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, plan_id integer NOT NULL,
    name text NOT NULL, order_index integer NOT NULL, duration_weeks integer NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES training_plans(id) ON UPDATE no action ON DELETE cascade);
  CREATE TABLE plan_weeks (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, phase_id integer NOT NULL,
    week_number integer NOT NULL, notes text,
    FOREIGN KEY (phase_id) REFERENCES plan_phases(id) ON UPDATE no action ON DELETE cascade);
  CREATE TABLE plan_sessions (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, week_id integer NOT NULL,
    day_of_week integer NOT NULL, type text NOT NULL, target_duration_min integer, target_hr_zone integer,
    intensity_label text, coaching_note text, status text DEFAULT 'planned' NOT NULL, linked_activity_id integer,
    completed_at integer, completion_note text,
    FOREIGN KEY (week_id) REFERENCES plan_weeks(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (linked_activity_id) REFERENCES activities(id) ON UPDATE no action ON DELETE set null);
  CREATE TABLE user_profile (id integer PRIMARY KEY NOT NULL, name text, age integer, max_hr integer,
    resting_hr integer, goal_event text, goal_finish_time text, training_days_per_week integer,
    fixed_rest_days text, injury_notes text, theme text DEFAULT 'dark' NOT NULL,
    ollama_model text DEFAULT 'llama3.1:8b' NOT NULL, ollama_url text DEFAULT 'http://localhost:11434' NOT NULL,
    weekly_goal_km real, weekly_goal_sessions integer, daily_calorie_target integer,
    daily_protein_target_g real, daily_water_target_ml integer);
  CREATE TABLE habits (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL,
    emoji text NOT NULL DEFAULT 'default', color text NOT NULL DEFAULT 'blue', created_at integer NOT NULL,
    archived_at integer);
  CREATE TABLE habit_logs (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    habit_id integer NOT NULL REFERENCES habits(id) ON DELETE CASCADE, date text NOT NULL,
    completed_at integer NOT NULL);
  CREATE UNIQUE INDEX habit_logs_habit_date_uix ON habit_logs(habit_id, date);
  CREATE TABLE daily_checkins (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, date text NOT NULL UNIQUE,
    morning_energy integer, morning_clarity integer, morning_intention text, evening_rating integer,
    evening_wins text, evening_note text, created_at integer NOT NULL, updated_at integer NOT NULL);
  CREATE TABLE recovery_logs (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, date text NOT NULL UNIQUE,
    hrv_rmssd real, body_battery integer, sleep_score integer, readiness_score integer, resting_hr integer,
    note text, source text NOT NULL DEFAULT 'manual', created_at integer NOT NULL, updated_at integer NOT NULL);
  CREATE TABLE nutrition_logs (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, date text NOT NULL, label text,
    calories integer, protein_g real, water_ml integer, note text, created_at integer NOT NULL);
  CREATE TABLE body_metrics (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, date text NOT NULL, weight_kg real,
    body_fat_pct real, note text, created_at integer NOT NULL);
  CREATE TABLE challenge_pool (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, text text NOT NULL,
    category text NOT NULL DEFAULT 'fitness', is_built_in integer NOT NULL DEFAULT 0,
    is_active integer NOT NULL DEFAULT 1);
  CREATE TABLE daily_challenges (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, date text NOT NULL,
    pool_id integer, text text NOT NULL, completed integer NOT NULL DEFAULT 0, completed_at integer);
  CREATE TABLE "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric);
`

// Contains orphan chains: phase 2 (plan 99 missing) -> week 3 -> session 4;
// week 4 (phase 77 missing) -> session 5; session 6 (week 55 missing);
// session 7 has a dead activity link but a valid week.
const ALL_ROWS_SQL = `
  INSERT INTO user_profile (id, name, theme, weekly_goal_km, daily_calorie_target) VALUES (1, 'Adel', 'dark', 40, 2500);
  INSERT INTO activities (id, type, date, created_at, source, distance_km) VALUES
    (1, 'running', '2026-09-01', 1, 'manual', 10), (2, 'running', '2026-09-02', 2, 'manual', 5);
  INSERT INTO training_plans (id, name, is_active, created_at) VALUES (1, 'Marathon', 1, 1);
  INSERT INTO plan_phases (id, plan_id, name, order_index, duration_weeks) VALUES
    (1, 1, 'Base', 0, 2), (2, 99, 'Orphan phase', 1, 2);
  INSERT INTO plan_weeks (id, phase_id, week_number) VALUES (1, 1, 1), (2, 1, 2), (3, 2, 1), (4, 77, 1);
  INSERT INTO plan_sessions (id, week_id, day_of_week, type, status, linked_activity_id) VALUES
    (1, 1, 1, 'running', 'completed', 1), (2, 1, 3, 'running', 'planned', NULL), (3, 2, 1, 'rest', 'planned', NULL),
    (4, 3, 1, 'running', 'planned', NULL), (5, 4, 1, 'running', 'planned', NULL),
    (6, 55, 1, 'running', 'planned', NULL), (7, 2, 5, 'running', 'planned', 999);
  INSERT INTO daily_checkins (id, date, morning_energy, created_at, updated_at) VALUES (1, '2026-09-01', 4, 1, 1);
  INSERT INTO recovery_logs (id, date, hrv_rmssd, created_at, updated_at) VALUES (1, '2026-09-01', 55.5, 1, 1);
  INSERT INTO habits (id, name, created_at) VALUES (1, 'Stretch', 1);
  INSERT INTO habit_logs (id, habit_id, date, completed_at) VALUES (1, 1, '2026-09-01', 1);
  INSERT INTO nutrition_logs (id, date, calories, created_at) VALUES (1, '2026-09-01', 500, 1);
  INSERT INTO challenge_pool (id, text) VALUES (1, 'Push-ups');
  INSERT INTO coach_conversations (id, created_at, updated_at) VALUES (1, 1, 1);
  INSERT INTO coach_messages (id, conversation_id, role, content, created_at) VALUES (1, 1, 'user', 'hi', 1);
  INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('abc', 1);
`

const count = (db: DatabaseSync, table: string): number =>
  Number((db.prepare(`SELECT count(*) AS c FROM "${table}"`).get() as { c: number }).c)
const userVersion = (db: DatabaseSync): number =>
  Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
const fkOn = (db: DatabaseSync): number =>
  Number((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys)
const tableNames = (db: DatabaseSync): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(r => r.name)
const columnNames = (db: DatabaseSync, table: string): string[] =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(r => r.name)

describe('migrations', () => {
  let dir: string
  let backupDir: string
  let db: DatabaseSync
  const now = new Date(2026, 9, 10, 7, 33) // local 2026-10-10 07:33

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitcoach-mig-'))
    backupDir = path.join(dir, 'backups')
    db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
  })

  afterEach(() => {
    try { db.close() } catch { /* closed */ }
    fs.rmSync(dir, { recursive: true, force: true })
  })

  describe('fresh database', () => {
    it('ends at the latest version, creates no backup files, keeps foreign_keys ON', () => {
      const res = runMigrations(db, backupDir, { now })
      expect(res).toMatchObject({ from: 0, to: LATEST, backupPath: null })
      expect(userVersion(db)).toBe(LATEST)
      expect(fs.existsSync(backupDir)).toBe(false)
      expect(fkOn(db)).toBe(1)
    })

    it('matches the Drizzle schema: same tables and columns, nothing extra', () => {
      runMigrations(db, backupDir, { now })
      const drizzleTables = (Object.values(schema) as unknown[]).filter(t => is(t, SQLiteTable)) as SQLiteTable[]
      expect(tableNames(db)).toEqual(drizzleTables.map(t => getTableName(t)).sort())
      for (const t of drizzleTables) {
        const cols = Object.values(getTableColumns(t)).map(c => c.name).sort()
        expect(columnNames(db, getTableName(t)).sort(), getTableName(t)).toEqual(cols)
      }
    })

    it('is a no-op when run again', () => {
      runMigrations(db, backupDir, { now })
      expect(runMigrations(db, backupDir, { now })).toMatchObject({ from: LATEST, to: LATEST, backupPath: null })
    })

    it('every table works through Drizzle (insert + select, cascade)', () => {
      runMigrations(db, backupDir, { now })
      const d = createDrizzle(db)
      d.insert(schema.userProfile).values({ id: 1, name: 'A' }).run()
      d.insert(schema.hrZones).values({ zoneNumber: 1, minHr: 1, maxHr: 2, label: 'Z1' }).run()
      d.insert(schema.activities).values({ type: 'running', date: '2026-01-01', createdAt: 1, source: 'manual' }).run()
      d.insert(schema.trainingPlans).values({ id: 1, name: 'P', startDate: '2026-05-18', createdAt: 1 }).run()
      d.insert(schema.planWeeks).values({ id: 1, planId: 1, weekIndex: 0 }).run()
      d.insert(schema.planSessions).values({ weekId: 1, dayOfWeek: 1, type: 'running' }).run()
      d.insert(schema.dailyCheckins).values({ date: '2026-01-01', createdAt: 1, updatedAt: 1 }).run()
      d.insert(schema.recoveryLogs).values({ date: '2026-01-01', hrvRmssd: 1.5, createdAt: 1, updatedAt: 1 }).run()
      for (const t of [schema.userProfile, schema.hrZones, schema.activities, schema.trainingPlans,
        schema.planWeeks, schema.planSessions, schema.dailyCheckins, schema.recoveryLogs]) {
        expect(d.select().from(t).all(), getTableName(t)).toHaveLength(1)
      }
      expect(d.select().from(schema.planSessions).all()[0].status).toBe('planned')
      d.delete(schema.trainingPlans).run()
      expect(d.select().from(schema.planSessions).all()).toHaveLength(0)
    })
  })

  describe('existing legacy database (user_version 0)', () => {
    beforeEach(() => {
      db.exec('PRAGMA foreign_keys = OFF')
      db.exec(LEGACY_DDL)
      db.exec(ALL_ROWS_SQL)
      db.exec('PRAGMA foreign_keys = ON')
    })

    it('cleans up orphans, keeps valid data, drops old tables/columns, writes both safety copies', () => {
      const before = {
        activities: count(db, 'activities'), checkins: count(db, 'daily_checkins'), recovery: count(db, 'recovery_logs'),
      }
      const res = runMigrations(db, backupDir, { now })

      expect(res.from).toBe(0)
      expect(res.to).toBe(LATEST)
      expect(userVersion(db)).toBe(LATEST)

      // orphan chains gone, valid plan data intact (session 7 kept, its dead link cleared);
      // v3 wandelt Phasen in Wochen-Felder um (plan_phases existiert nicht mehr)
      expect(tableNames(db)).not.toContain('plan_phases')
      expect(count(db, 'plan_weeks')).toBe(2)
      expect((db.prepare('SELECT id FROM plan_sessions ORDER BY id').all() as { id: number }[]).map(r => r.id)).toEqual([1, 2, 3, 7])
      expect((db.prepare('SELECT linked_activity_id AS l FROM plan_sessions WHERE id = 1').get() as { l: number }).l).toBe(1)
      expect((db.prepare('SELECT linked_activity_id AS l FROM plan_sessions WHERE id = 7').get() as { l: number | null }).l).toBeNull()
      expect(count(db, 'training_plans')).toBe(1)

      // untouched
      expect(count(db, 'activities')).toBe(before.activities)
      expect(count(db, 'daily_checkins')).toBe(before.checkins)
      expect(count(db, 'recovery_logs')).toBe(before.recovery)
      expect((db.prepare('SELECT hrv_rmssd AS h FROM recovery_logs').get() as { h: number }).h).toBe(55.5)

      // removed
      const tables = tableNames(db)
      for (const gone of ['habits', 'habit_logs', 'nutrition_logs', 'body_metrics', 'challenge_pool',
        'daily_challenges', 'coach_conversations', 'coach_messages', '__drizzle_migrations']) {
        expect(tables, gone).not.toContain(gone)
      }
      const cols = columnNames(db, 'user_profile')
      for (const gone of ['daily_calorie_target', 'daily_protein_target_g', 'daily_water_target_ml']) {
        expect(cols, gone).not.toContain(gone)
      }
      expect(db.prepare('SELECT weekly_goal_km AS k, name FROM user_profile').get()).toMatchObject({ k: 40, name: 'Adel' })

      // safety copies
      const files = fs.readdirSync(backupDir).sort()
      expect(files).toEqual([
        `vor-migration-v0-v${LATEST}-2026-10-10-0733.db`,
        'vor-v2-alle-tabellen-2026-10-10-0733.json',
      ])
      expect(res.backupPath).toBe(path.join(backupDir, files[0]))

      // .db copy is the ORIGINAL state (still has habits and all orphans)
      const copy = new DatabaseSync(res.backupPath!, { readOnly: true })
      expect(count(copy, 'habits')).toBe(1)
      expect(count(copy, 'plan_sessions')).toBe(7)
      expect(userVersion(copy)).toBe(0)
      copy.close()

      // JSON has ALL rows of ALL tables with raw column names
      const json = JSON.parse(fs.readFileSync(path.join(backupDir, files[1]), 'utf-8')) as Record<string, Record<string, unknown>[]>
      expect(json.habits).toHaveLength(1)
      expect(json.plan_sessions).toHaveLength(7)
      expect(json.__drizzle_migrations).toHaveLength(1)
      expect(json.user_profile[0].daily_calorie_target).toBe(2500)
      expect(json.recovery_logs[0].hrv_rmssd).toBe(55.5)
    })

    it('v3 wandelt einen Phasen-Plan um: Startdatum, Wochen-Index, Verknüpfungen, ohne Verstöße', () => {
      db.exec('PRAGMA foreign_keys = OFF')
      db.exec(`
        DELETE FROM plan_sessions; DELETE FROM plan_weeks; DELETE FROM plan_phases; DELETE FROM training_plans; DELETE FROM activities;
        INSERT INTO activities (id, type, date, created_at, source, distance_km) VALUES (1, 'running', '2026-05-19', 1, 'manual', 3.1);
        INSERT INTO training_plans (id, name, is_active, created_at) VALUES (9, 'Marathon Base to Finish', 1, 1);
        INSERT INTO plan_phases (id, plan_id, name, order_index, duration_weeks) VALUES (1, 9, 'Base', 0, 2), (2, 9, 'Build', 1, 1);
        INSERT INTO plan_weeks (id, phase_id, week_number) VALUES (1, 1, 1), (2, 1, 2), (3, 2, 1);
        INSERT INTO plan_sessions (id, week_id, day_of_week, type, intensity_label, status, linked_activity_id) VALUES
          (1, 1, 2, 'running', 'Easy', 'completed', 1), (2, 1, 4, 'running', NULL, 'planned', NULL),
          (3, 1, 7, 'rest', NULL, 'planned', NULL), (4, 2, 1, 'running', NULL, 'skipped', NULL),
          (5, 2, 3, 'running', NULL, 'planned', NULL), (6, 3, 2, 'running', NULL, 'planned', NULL),
          (7, 3, 6, 'running', NULL, 'planned', NULL);
      `)
      db.exec('PRAGMA foreign_keys = ON')
      runMigrations(db, backupDir, { now })

      expect(userVersion(db)).toBe(LATEST)
      expect(db.prepare('SELECT start_date AS s, is_active AS a, name FROM training_plans').all())
        .toEqual([{ s: '2026-05-18', a: 0, name: 'Marathon Base to Finish' }])
      expect((db.prepare('SELECT week_index AS i, phase FROM plan_weeks ORDER BY week_index').all()))
        .toEqual([{ i: 0, phase: 'Base' }, { i: 1, phase: 'Base' }, { i: 2, phase: 'Build' }])
      expect(count(db, 'plan_sessions')).toBe(7)
      expect(db.prepare('SELECT linked_activity_id AS l, match_source AS m, title, status, steps FROM plan_sessions WHERE id = 1').get())
        .toEqual({ l: 1, m: 'manual', title: 'Easy', status: 'completed', steps: null })
      expect(tableNames(db)).not.toContain('plan_phases')
      expect(tableNames(db).filter(t => t.endsWith('_new'))).toEqual([])
      expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0)
      // Indizes
      const idx = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'plan_sessions_%'").all() as { name: string }[]).map(r => r.name).sort()
      expect(idx).toEqual(['plan_sessions_activity_idx', 'plan_sessions_week_idx'])
    })

    it('result passes PRAGMA foreign_key_check and foreign_keys is restored', () => {
      runMigrations(db, backupDir, { now })
      expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0)
      expect(fkOn(db)).toBe(1)
    })

    it('after migration the DB works through Drizzle', () => {
      runMigrations(db, backupDir, { now })
      const d = createDrizzle(db)
      expect(d.select().from(schema.userProfile).all()[0].name).toBe('Adel')
      d.insert(schema.userProfile).values({ id: 2, name: 'X' }).run()
    })

    it('failing migration: rollback, user_version unchanged, error thrown, copy exists', () => {
      runMigrations(db, backupDir, { now }) // bring to LATEST first
      const boom: Migration = {
        version: LATEST + 1,
        name: 'boom',
        up({ db: d }) {
          d.exec('DROP TABLE recovery_logs')
          d.exec('DELETE FROM activities')
          throw new Error('kaputt')
        },
      }
      expect(() => runMigrations(db, backupDir, { now, migrations: [...MIGRATIONS, boom] })).toThrow(/boom.*kaputt/)
      expect(userVersion(db)).toBe(LATEST)
      expect(count(db, 'recovery_logs')).toBe(1)
      expect(count(db, 'activities')).toBe(2)
      expect(db.isTransaction).toBe(false)
      expect(fkOn(db)).toBe(1)
      expect(fs.readdirSync(backupDir).some(f => f.startsWith(`vor-migration-v${LATEST}-v${LATEST + 1}`))).toBe(true)
    })

    it('failure in v2 after its deletes rolls v2 back completely (stays at v1)', () => {
      const broken = MIGRATIONS.map(m => m.version === 2
        ? { ...m, up: (ctx: Parameters<Migration['up']>[0]) => { m.up(ctx); throw new Error('nach dem Loeschen') } }
        : m)
      expect(() => runMigrations(db, backupDir, { now, migrations: broken })).toThrow(/nach dem Loeschen/)
      expect(userVersion(db)).toBe(1)
      expect(count(db, 'habits')).toBe(1)
      expect(count(db, 'plan_sessions')).toBe(7)
      expect(columnNames(db, 'user_profile')).toContain('daily_calorie_target')
    })

    it('aborts without migrating when the safety copy cannot be written', () => {
      fs.writeFileSync(backupDir, 'not a directory') // backupDir is a FILE -> copy impossible
      expect(() => runMigrations(db, backupDir, { now })).toThrow()
      expect(userVersion(db)).toBe(0)
      expect(count(db, 'habits')).toBe(1)
    })

    it('refuses a database from a newer app version', () => {
      db.exec(`PRAGMA user_version = ${LATEST + 5}`)
      expect(() => runMigrations(db, backupDir, { now })).toThrow(/Version/)
    })
  })

  describe('v4 garmin-details', () => {
    it('keeps existing activities/recovery, adds columns and tables', () => {
      runMigrations(db, backupDir, { now, migrations: MIGRATIONS.filter(m => m.version <= 3) })
      db.exec(`INSERT INTO activities (id, type, date, created_at, source, distance_km) VALUES (1, 'running', '2026-09-01', 1, 'manual', 10);
        INSERT INTO recovery_logs (id, date, hrv_rmssd, created_at, updated_at) VALUES (1, '2026-09-01', 55.5, 1, 1);`)
      const res = runMigrations(db, backupDir, { now })
      expect(res).toMatchObject({ from: 3, to: LATEST })
      expect(columnNames(db, 'activities')).toEqual(expect.arrayContaining(['elevation_gain_m', 'elevation_loss_m', 'moving_time_min', 'external_id']))
      expect(columnNames(db, 'recovery_logs')).toContain('sleep_hours')
      expect(tableNames(db)).toEqual(expect.arrayContaining(['activity_splits', 'activity_streams', 'app_settings']))
      expect(db.prepare('SELECT distance_km AS d, external_id AS e FROM activities').get()).toEqual({ d: 10, e: null })
      expect((db.prepare('SELECT hrv_rmssd AS h, sleep_hours AS s FROM recovery_logs').get() as { h: number; s: number | null })).toEqual({ h: 55.5, s: null })
    })

    it('external_id is unique when set; NULLs may repeat', () => {
      runMigrations(db, backupDir, { now })
      const ins = db.prepare("INSERT INTO activities (type, date, created_at, source, external_id) VALUES ('running', '2026-09-01', 1, 'manual', ?)")
      ins.run(null); ins.run(null); ins.run('icu:1')
      expect(() => ins.run('icu:1')).toThrow(/UNIQUE/i)
    })

    it('deleting an activity cascades to splits and streams; split_index is unique per activity', () => {
      runMigrations(db, backupDir, { now })
      db.exec(`INSERT INTO activities (id, type, date, created_at, source) VALUES (1, 'running', '2026-09-01', 1, 'manual');
        INSERT INTO activity_splits (activity_id, split_index, distance_km, duration_sec) VALUES (1, 1, 1, 300), (1, 2, 1, 310);
        INSERT INTO activity_streams (activity_id, data) VALUES (1, '{}');`)
      expect(() => db.exec('INSERT INTO activity_splits (activity_id, split_index, distance_km, duration_sec) VALUES (1, 1, 1, 1)')).toThrow(/UNIQUE/i)
      db.exec('DELETE FROM activities WHERE id = 1')
      expect(count(db, 'activity_splits')).toBe(0)
      expect(count(db, 'activity_streams')).toBe(0)
    })
  })

  describe('v5 schuhe-befinden', () => {
    it('legt shoes, shoe_id, feeling, day_start_hour an und lässt Daten unberührt', () => {
      runMigrations(db, backupDir, { now, migrations: MIGRATIONS.filter(m => m.version <= 4) })
      db.exec(`INSERT INTO activities (id, type, date, created_at, source) VALUES (1, 'running', '2026-09-01', 1, 'manual');
        INSERT INTO user_profile (id, name) VALUES (1, 'A');`)
      const res = runMigrations(db, backupDir, { now, migrations: MIGRATIONS.filter(m => m.version <= 5) })
      expect(res).toMatchObject({ from: 4, to: 5 })
      expect(tableNames(db)).toContain('shoes')
      expect(columnNames(db, 'activities')).toContain('shoe_id')
      expect(columnNames(db, 'recovery_logs')).toContain('feeling')
      expect((db.prepare('SELECT day_start_hour AS h FROM user_profile').get() as { h: number }).h).toBe(4)
      expect((db.prepare('SELECT shoe_id AS s FROM activities').get() as { s: number | null }).s).toBeNull()
    })

    it('Schuh löschen setzt shoe_id der Aktivität auf NULL', () => {
      runMigrations(db, backupDir, { now })
      db.exec(`INSERT INTO shoes (id, name, created_at) VALUES (1, 'X', 1);
        INSERT INTO activities (id, type, date, created_at, source, shoe_id) VALUES (1, 'running', '2026-09-01', 1, 'manual', 1);`)
      db.exec('DELETE FROM shoes WHERE id = 1')
      expect((db.prepare('SELECT shoe_id AS s FROM activities').get() as { s: number | null }).s).toBeNull()
    })

    it('übernimmt morning_energy als Befinden: ergänzt vorhandene Zeile, legt sonst neue an', () => {
      runMigrations(db, backupDir, { now, migrations: MIGRATIONS.filter(m => m.version <= 4) })
      db.exec(`
        INSERT INTO recovery_logs (date, hrv_rmssd, created_at, updated_at) VALUES ('2026-09-01', 50, 1, 1), ('2026-09-02', 51, 1, 1);
        INSERT INTO daily_checkins (date, morning_energy, created_at, updated_at) VALUES
          ('2026-09-01', 4, 10, 11), ('2026-09-03', 2, 20, 21), ('2026-09-04', NULL, 30, 31);
      `)
      runMigrations(db, backupDir, { now })
      const rows = db.prepare('SELECT date, feeling, source, hrv_rmssd AS hrv, created_at AS c, updated_at AS u FROM recovery_logs ORDER BY date').all()
      expect(rows).toEqual([
        { date: '2026-09-01', feeling: 4, source: 'manual', hrv: 50, c: 1, u: 1 },
        { date: '2026-09-02', feeling: null, source: 'manual', hrv: 51, c: 1, u: 1 },
        { date: '2026-09-03', feeling: 2, source: 'manual', hrv: null, c: 20, u: 21 },
      ])
      expect(count(db, 'daily_checkins')).toBe(3)
    })
  })

  describe('v6 plan-adapt', () => {
    it('v6 adds pain, feedback_at, current_10k_sec and plan_proposals', () => {
      runMigrations(db, backupDir, { now, migrations: MIGRATIONS.filter(m => m.version <= 5) })
      db.exec(`INSERT INTO activities (id, type, date, created_at, source) VALUES (1, 'running', '2026-09-01', 1, 'manual');
        INSERT INTO training_plans (id, name, start_date, is_active, created_at) VALUES (3, 'P', '2026-08-31', 1, 1);`)
      const res = runMigrations(db, backupDir, { now })
      expect(res).toMatchObject({ from: 5, to: 6 })
      expect(columnNames(db, 'activities')).toEqual(expect.arrayContaining(['pain', 'feedback_at']))
      expect(columnNames(db, 'user_profile')).toContain('current_10k_sec')
      db.exec(`INSERT INTO plan_proposals (plan_id, activity_id, kind, changes, reasons, created_at) VALUES (3, 1, 'run', '[]', '[]', 5)`)
      expect((db.prepare('SELECT status, meta FROM plan_proposals').get() as { status: string; meta: string })).toEqual({ status: 'open', meta: '{}' })
      db.exec('DELETE FROM activities WHERE id = 1')
      expect((db.prepare('SELECT activity_id AS a FROM plan_proposals').get() as { a: number | null }).a).toBeNull()
      db.exec('DELETE FROM training_plans WHERE id = 3')
      expect(count(db, 'plan_proposals')).toBe(0)
    })
  })

  it('v1 repairs an old database that lacks columns/tables, without touching data', () => {
    db.exec(`
      CREATE TABLE activities (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, type text NOT NULL, date text NOT NULL,
        created_at integer NOT NULL, source text NOT NULL);
      CREATE TABLE user_profile (id integer PRIMARY KEY NOT NULL, name text, theme text DEFAULT 'dark' NOT NULL);
      INSERT INTO activities (type, date, created_at, source) VALUES ('running', '2026-01-01', 1, 'manual');
      INSERT INTO user_profile (id, name) VALUES (1, 'Keep');
    `)
    runMigrations(db, backupDir, { now, migrations: MIGRATIONS.filter(m => m.version === 1) })
    expect(userVersion(db)).toBe(1)
    expect(columnNames(db, 'user_profile')).toContain('weekly_goal_km')
    expect(tableNames(db)).toContain('recovery_logs')
    expect(count(db, 'activities')).toBe(1)
    expect((db.prepare('SELECT name FROM user_profile').get() as { name: string }).name).toBe('Keep')
  })
})
