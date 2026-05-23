import { drizzle } from 'drizzle-orm/sql-js'
import initSqlJs from 'sql.js'
import { migrate } from 'drizzle-orm/sql-js/migrator'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import * as schema from './schema'

type Db = ReturnType<typeof drizzle<typeof schema>>

let db: Db | null = null
let sqlDb: InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']> | null = null
let persistPath = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null

export async function initDb(): Promise<void> {
  const userDataPath = app.getPath('userData')
  persistPath = path.join(userDataPath, 'fitcoach.db')

  // Resolve WASM relative to the sql.js package itself — works in dev and packaged
  const sqlJsMain = require.resolve('sql.js')
  const wasmPath = path.join(path.dirname(sqlJsMain), 'sql-wasm.wasm')

  const SQL = await initSqlJs({ locateFile: () => wasmPath })

  const fileBuffer = fs.existsSync(persistPath) ? fs.readFileSync(persistPath) : null
  sqlDb = new SQL.Database(fileBuffer ?? undefined)

  sqlDb.run('PRAGMA foreign_keys = ON')

  db = drizzle(sqlDb, { schema })

  // In dev: __dirname = dist-electron/db → go up two levels to project root
  // In packaged: use process.resourcesPath
  const migrationsFolder = app.isPackaged
    ? path.join(process.resourcesPath, 'db', 'migrations')
    : path.join(__dirname, '..', '..', 'db', 'migrations')

  if (!fs.existsSync(migrationsFolder)) {
    throw new Error(`Migrations folder not found at: ${migrationsFolder}`)
  }

  await migrate(db, { migrationsFolder })

  // ── Schema patch ─────────────────────────────────────────────────────────────
  //
  // Migrations 0002–0005 were created with 2025 timestamps while migrations
  // 0000–0001 use 2026 timestamps. The Drizzle migrator only runs a migration
  // when its `when` value is greater than the last applied migration's
  // `created_at`, so those migrations were silently skipped on any database
  // that already had 0001 applied. This block re-applies everything they
  // should have done using try/catch for columns (SQLite does not support
  // ALTER TABLE … ADD COLUMN IF NOT EXISTS in the sql.js WASM build) and
  // CREATE TABLE IF NOT EXISTS for tables.
  //
  // All operations here are idempotent — safe to run on every startup.

  applySchemaPatches()

  flushDb()
}

function applySchemaPatches(): void {
  if (!sqlDb) return

  // ── Tables (CREATE TABLE IF NOT EXISTS is always safe) ──────────────────────

  sqlDb.exec(`
    CREATE TABLE IF NOT EXISTS habits (
      id         integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name       text    NOT NULL,
      emoji      text    NOT NULL DEFAULT 'default',
      color      text    NOT NULL DEFAULT 'blue',
      created_at integer NOT NULL,
      archived_at integer
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id           integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      habit_id     integer NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      date         text    NOT NULL,
      completed_at integer NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_checkins (
      id                integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      date              text    NOT NULL UNIQUE,
      morning_energy    integer,
      morning_clarity   integer,
      morning_intention text,
      evening_rating    integer,
      evening_wins      text,
      evening_note      text,
      created_at        integer NOT NULL,
      updated_at        integer NOT NULL
    );

    CREATE TABLE IF NOT EXISTS body_metrics (
      id          integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      date        text NOT NULL,
      weight_kg   real,
      body_fat_pct real,
      note        text,
      created_at  integer NOT NULL
    );
  `)

  // ── Columns (ALTER TABLE ADD COLUMN throws if column already exists — catch) ─
  // sql.js WASM does not support ALTER TABLE … ADD COLUMN IF NOT EXISTS.

  const tryAddColumn = (stmt: string) => {
    try { sqlDb!.run(stmt) } catch { /* column already exists — safe to ignore */ }
  }

  // from migration 0002 — completion_note on plan_sessions
  tryAddColumn('ALTER TABLE plan_sessions ADD completion_note text')

  // from migration 0003 — weekly goals on user_profile
  tryAddColumn('ALTER TABLE user_profile ADD weekly_goal_km real')
  tryAddColumn('ALTER TABLE user_profile ADD weekly_goal_sessions integer')

  // Phase 3 — nutrition targets on user_profile
  tryAddColumn('ALTER TABLE user_profile ADD daily_calorie_target integer')
  tryAddColumn('ALTER TABLE user_profile ADD daily_protein_target_g real')
  tryAddColumn('ALTER TABLE user_profile ADD daily_water_target_ml integer')

  // Phase 4 — recovery_logs table
  sqlDb.exec(`
    CREATE TABLE IF NOT EXISTS recovery_logs (
      id              integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      date            text    NOT NULL UNIQUE,
      hrv_rmssd       real,
      body_battery    integer,
      sleep_score     integer,
      readiness_score integer,
      resting_hr      integer,
      note            text,
      source          text    NOT NULL DEFAULT 'manual',
      created_at      integer NOT NULL,
      updated_at      integer NOT NULL
    );
  `)

  // Phase 3 — nutrition_logs table
  sqlDb.exec(`
    CREATE TABLE IF NOT EXISTS nutrition_logs (
      id          integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      date        text    NOT NULL,
      label       text,
      calories    integer,
      protein_g   real,
      water_ml    integer,
      note        text,
      created_at  integer NOT NULL
    );
  `)

  // Phase 6 — challenge_pool + daily_challenges tables
  sqlDb.exec(`
    CREATE TABLE IF NOT EXISTS challenge_pool (
      id          integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      text        text    NOT NULL,
      category    text    NOT NULL DEFAULT 'fitness',
      is_built_in integer NOT NULL DEFAULT 0,
      is_active   integer NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS daily_challenges (
      id           integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      date         text    NOT NULL,
      pool_id      integer,
      text         text    NOT NULL,
      completed    integer NOT NULL DEFAULT 0,
      completed_at integer
    );
  `)

  // Seed built-in challenges — INSERT OR IGNORE keeps this idempotent on every startup
  sqlDb.exec(`
    INSERT OR IGNORE INTO challenge_pool (id, text, category, is_built_in, is_active) VALUES
      (1,  'Do 20 push-ups',                          'fitness',   1, 1),
      (2,  'Do 10 pull-ups',                          'fitness',   1, 1),
      (3,  'Do 30 squats',                            'fitness',   1, 1),
      (4,  'Hold a plank for 60 seconds',             'fitness',   1, 1),
      (5,  'Do 15 burpees',                           'fitness',   1, 1),
      (6,  'Do 20 lunges (each leg)',                 'fitness',   1, 1),
      (7,  'Go for a 15-minute walk outside',         'fitness',   1, 1),
      (8,  'Stretch for 10 minutes',                  'mobility',  1, 1),
      (9,  'Do 5 minutes of foam rolling',            'mobility',  1, 1),
      (10, 'Read for 15 minutes',                     'mindset',   1, 1),
      (11, 'Meditate for 5 minutes',                  'mindset',   1, 1),
      (12, 'No social media for 2 hours',             'mindset',   1, 1),
      (13, 'Write in your journal',                   'mindset',   1, 1),
      (14, 'Go to bed before 10:30 PM',               'mindset',   1, 1),
      (15, 'Drink 3 L of water',                      'nutrition', 1, 1),
      (16, 'Eat no processed sugar today',            'nutrition', 1, 1),
      (17, 'Eat vegetables with every meal',          'nutrition', 1, 1),
      (18, 'Cook a meal from scratch',                'nutrition', 1, 1),
      (19, 'Take a cold shower',                      'fitness',   1, 1),
      (20, 'Do 50 jumping jacks',                     'fitness',   1, 1)
    ;
  `)

  // ── Indexes ──────────────────────────────────────────────────────────────────

  // Deduplicate habit_logs before adding the unique constraint (from migration 0005)
  // Keep only the earliest log per (habit_id, date) pair.
  try {
    sqlDb.run(
      'DELETE FROM habit_logs WHERE id NOT IN ' +
      '(SELECT MIN(id) FROM habit_logs GROUP BY habit_id, date)'
    )
  } catch { /* table empty or doesn't exist yet — safe to ignore */ }

  try {
    sqlDb.run(
      'CREATE UNIQUE INDEX IF NOT EXISTS habit_logs_habit_date_uix ' +
      'ON habit_logs(habit_id, date)'
    )
  } catch { /* already exists */ }
}

export function markDirty(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushDb, 500)
}

function flushDb(): void {
  if (!sqlDb || !persistPath) return
  const data = sqlDb.export()
  const tmp = persistPath + '.tmp'
  fs.writeFileSync(tmp, Buffer.from(data))
  fs.renameSync(tmp, persistPath)
  saveTimer = null
}

export function closeDb(): void {
  if (saveTimer) clearTimeout(saveTimer)
  flushDb()
}

export function getDb(): Db {
  if (!db) throw new Error('Database not initialised — call initDb() first')
  return db
}
