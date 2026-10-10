/**
 * Test-only helper: builds an in-memory sql.js database with the FULL schema,
 * wrapped with Drizzle exactly like the app does. Not imported by app code.
 */
import { createRequire } from 'module'
import * as path from 'path'
import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import * as schema from '../../db/schema'

export type TestDb = ReturnType<typeof drizzle<typeof schema>>

// cwd-based (not import.meta) so this file also type-checks under the CommonJS electron tsconfig
const require = createRequire(path.join(process.cwd(), 'package.json'))

export const CREATE_TABLES = `
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
  CREATE TABLE habits (
    id integer PRIMARY KEY AUTOINCREMENT, name text NOT NULL, emoji text NOT NULL DEFAULT 'default',
    color text NOT NULL DEFAULT 'blue', created_at integer NOT NULL, archived_at integer
  );
  CREATE TABLE habit_logs (
    id integer PRIMARY KEY AUTOINCREMENT,
    habit_id integer NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date text NOT NULL, completed_at integer NOT NULL
  );
  CREATE TABLE daily_checkins (
    id integer PRIMARY KEY AUTOINCREMENT, date text NOT NULL UNIQUE,
    morning_energy integer, morning_clarity integer, morning_intention text,
    evening_rating integer, evening_wins text, evening_note text,
    created_at integer NOT NULL, updated_at integer NOT NULL
  );
  CREATE TABLE recovery_logs (
    id integer PRIMARY KEY AUTOINCREMENT, date text NOT NULL UNIQUE,
    hrv_rmssd real, body_battery integer, sleep_score integer, readiness_score integer,
    resting_hr integer, note text, source text NOT NULL DEFAULT 'manual',
    created_at integer NOT NULL, updated_at integer NOT NULL
  );
  CREATE TABLE nutrition_logs (
    id integer PRIMARY KEY AUTOINCREMENT, date text NOT NULL, label text, calories integer,
    protein_g real, water_ml integer, note text, created_at integer NOT NULL
  );
  CREATE TABLE body_metrics (
    id integer PRIMARY KEY AUTOINCREMENT, date text NOT NULL, weight_kg real,
    body_fat_pct real, note text, created_at integer NOT NULL
  );
  CREATE TABLE challenge_pool (
    id integer PRIMARY KEY AUTOINCREMENT, text text NOT NULL,
    category text NOT NULL DEFAULT 'fitness', is_built_in integer NOT NULL DEFAULT 0,
    is_active integer NOT NULL DEFAULT 1
  );
  CREATE TABLE daily_challenges (
    id integer PRIMARY KEY AUTOINCREMENT, date text NOT NULL, pool_id integer,
    text text NOT NULL, completed integer NOT NULL DEFAULT 0, completed_at integer
  );
`

export async function makeTestDb(): Promise<TestDb> {
  const sqlJsMain = require.resolve('sql.js')
  const wasmPath = path.join(path.dirname(sqlJsMain), 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  const sqlDb = new SQL.Database()
  sqlDb.run('PRAGMA foreign_keys = ON')
  sqlDb.exec(CREATE_TABLES)
  return drizzle(sqlDb, { schema })
}
