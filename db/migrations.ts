/**
 * Own migration system (replaces the Drizzle migrator + applySchemaPatches).
 *
 * - The schema version lives in `PRAGMA user_version`.
 * - Every migration runs in its own transaction (BEGIN IMMEDIATE … COMMIT);
 *   on error: ROLLBACK, the error is thrown and the app refuses to start.
 * - Before pending migrations run on an EXISTING database, a full copy is
 *   written with `VACUUM INTO` (works with WAL, unlike a plain file copy).
 *   If that copy fails, nothing is migrated.
 * - `foreign_keys` is OFF while migrating (table rebuilds / drops); the final
 *   migration verifies `PRAGMA foreign_key_check` before it commits.
 *
 * Free of `electron` imports so it can be unit-tested.
 */
import type { DatabaseSync } from 'node:sqlite'
import * as fs from 'fs'
import * as path from 'path'
import { format } from 'date-fns'
import { convertLegacyPlans } from '../electron/lib/legacyPlan'

export interface MigrationCtx {
  db: DatabaseSync
  backupDir: string
  /** local "now" — injectable for tests */
  now: Date
}

export interface Migration {
  version: number
  name: string
  up(ctx: MigrationCtx): void
}

// ── Small helpers ────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`

function all(db: DatabaseSync, sql: string): Row[] {
  return db.prepare(sql).all() as Row[]
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name = ?").get(name) !== undefined
}

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  return all(db, `PRAGMA table_info(${q(table)})`).some(r => r.name === column)
}

function ensureColumn(db: DatabaseSync, table: string, column: string, ddl: string): void {
  if (tableExists(db, table) && !columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${q(table)} ADD COLUMN ${ddl}`)
  }
}

function dropColumnIfExists(db: DatabaseSync, table: string, column: string): void {
  if (tableExists(db, table) && columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${q(table)} DROP COLUMN ${q(column)}`)
  }
}

function getUserVersion(db: DatabaseSync): number {
  return Number((db.prepare('PRAGMA user_version').get() as Row).user_version)
}

function getForeignKeys(db: DatabaseSync): boolean {
  return Number((db.prepare('PRAGMA foreign_keys').get() as Row).foreign_keys) === 1
}

/** Local timestamp for file names, e.g. 2026-10-10-0733 (never UTC). */
function stamp(now: Date): string {
  return format(now, 'yyyy-MM-dd-HHmm')
}

/** path with a numeric suffix if it already exists (same-minute reruns). */
function uniquePath(base: string, ext: string): string {
  let p = `${base}${ext}`
  for (let i = 2; fs.existsSync(p); i++) p = `${base}-${i}${ext}`
  return p
}

/** Full consistent copy of a (possibly WAL) database via VACUUM INTO. */
export function vacuumInto(db: DatabaseSync, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  fs.rmSync(tmp, { force: true })
  try {
    db.prepare('VACUUM INTO ?').run(tmp)
    fs.renameSync(tmp, target)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
}

// ── v1: baseline ─────────────────────────────────────────────────────────────

/**
 * v1 = the schema real databases had before this migration system existed
 * (Drizzle 0000–0007 + applySchemaPatches), including the since-removed
 * Habits/Ernährung/Körper/Challenges tables. Fully idempotent:
 *  - fresh DB: creates everything,
 *  - existing DB (user_version 0): repairs whatever is missing, touches no data.
 */
function v1Baseline({ db }: MigrationCtx): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      type text NOT NULL,
      date text NOT NULL,
      created_at integer NOT NULL,
      source text NOT NULL,
      garmin_file_name text,
      avg_hr integer,
      max_hr integer,
      duration_min real,
      start_time text,
      distance_km real,
      hr_zone_distribution text,
      perceived_effort integer,
      surface_type text,
      notes text,
      avg_cadence integer,
      bedtime text,
      wake_time text,
      sleep_quality integer,
      exercises text,
      type_label text,
      raw_garmin_data text
    );

    CREATE TABLE IF NOT EXISTS coach_conversations (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      title text DEFAULT 'New chat' NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coach_messages (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      conversation_id integer NOT NULL,
      role text NOT NULL,
      content text NOT NULL,
      created_at integer NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES coach_conversations(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE TABLE IF NOT EXISTS hr_zones (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      zone_number integer NOT NULL,
      min_hr integer NOT NULL,
      max_hr integer NOT NULL,
      label text NOT NULL
    );

    CREATE TABLE IF NOT EXISTS training_plans (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text NOT NULL,
      goal_event text,
      goal_date text,
      is_active integer DEFAULT 1 NOT NULL,
      created_at integer NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_phases (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      plan_id integer NOT NULL,
      name text NOT NULL,
      order_index integer NOT NULL,
      duration_weeks integer NOT NULL,
      FOREIGN KEY (plan_id) REFERENCES training_plans(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE TABLE IF NOT EXISTS plan_weeks (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      phase_id integer NOT NULL,
      week_number integer NOT NULL,
      notes text,
      FOREIGN KEY (phase_id) REFERENCES plan_phases(id) ON UPDATE no action ON DELETE cascade
    );

    CREATE TABLE IF NOT EXISTS plan_sessions (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      week_id integer NOT NULL,
      day_of_week integer NOT NULL,
      type text NOT NULL,
      target_duration_min integer,
      target_hr_zone integer,
      intensity_label text,
      coaching_note text,
      status text DEFAULT 'planned' NOT NULL,
      linked_activity_id integer,
      completed_at integer,
      completion_note text,
      FOREIGN KEY (week_id) REFERENCES plan_weeks(id) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (linked_activity_id) REFERENCES activities(id) ON UPDATE no action ON DELETE set null
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id integer PRIMARY KEY NOT NULL,
      name text,
      age integer,
      max_hr integer,
      resting_hr integer,
      goal_event text,
      goal_finish_time text,
      training_days_per_week integer,
      fixed_rest_days text,
      injury_notes text,
      theme text DEFAULT 'dark' NOT NULL,
      ollama_model text DEFAULT 'llama3.1:8b' NOT NULL,
      ollama_url text DEFAULT 'http://localhost:11434' NOT NULL,
      weekly_goal_km real,
      weekly_goal_sessions integer,
      daily_calorie_target integer,
      daily_protein_target_g real,
      daily_water_target_ml integer
    );

    CREATE TABLE IF NOT EXISTS habits (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text NOT NULL,
      emoji text NOT NULL DEFAULT 'default',
      color text NOT NULL DEFAULT 'blue',
      created_at integer NOT NULL,
      archived_at integer
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      habit_id integer NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      date text NOT NULL,
      completed_at integer NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_checkins (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      date text NOT NULL UNIQUE,
      morning_energy integer,
      morning_clarity integer,
      morning_intention text,
      evening_rating integer,
      evening_wins text,
      evening_note text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );

    CREATE TABLE IF NOT EXISTS body_metrics (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      date text NOT NULL,
      weight_kg real,
      body_fat_pct real,
      note text,
      created_at integer NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_logs (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      date text NOT NULL UNIQUE,
      hrv_rmssd real,
      body_battery integer,
      sleep_score integer,
      readiness_score integer,
      resting_hr integer,
      note text,
      source text NOT NULL DEFAULT 'manual',
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nutrition_logs (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      date text NOT NULL,
      label text,
      calories integer,
      protein_g real,
      water_ml integer,
      note text,
      created_at integer NOT NULL
    );

    CREATE TABLE IF NOT EXISTS challenge_pool (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      text text NOT NULL,
      category text NOT NULL DEFAULT 'fitness',
      is_built_in integer NOT NULL DEFAULT 0,
      is_active integer NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS daily_challenges (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      date text NOT NULL,
      pool_id integer,
      text text NOT NULL,
      completed integer NOT NULL DEFAULT 0,
      completed_at integer
    );
  `)

  // Repair for existing databases whose tables predate these columns
  // (the old Drizzle journal silently skipped migrations 0002–0007).
  ensureColumn(db, 'coach_conversations', 'title', "title text DEFAULT 'New chat' NOT NULL")
  ensureColumn(db, 'plan_sessions', 'completion_note', 'completion_note text')
  ensureColumn(db, 'user_profile', 'weekly_goal_km', 'weekly_goal_km real')
  ensureColumn(db, 'user_profile', 'weekly_goal_sessions', 'weekly_goal_sessions integer')
  ensureColumn(db, 'user_profile', 'daily_calorie_target', 'daily_calorie_target integer')
  ensureColumn(db, 'user_profile', 'daily_protein_target_g', 'daily_protein_target_g real')
  ensureColumn(db, 'user_profile', 'daily_water_target_ml', 'daily_water_target_ml integer')

  // Old migration 0005: one completion per habit and day.
  db.exec(
    'DELETE FROM habit_logs WHERE id NOT IN (SELECT MIN(id) FROM habit_logs GROUP BY habit_id, date);' +
    'CREATE UNIQUE INDEX IF NOT EXISTS habit_logs_habit_date_uix ON habit_logs(habit_id, date);'
  )
}

// ── v2: Phase-1 cleanup ──────────────────────────────────────────────────────

const REMOVED_TABLES = [
  'habit_logs', 'habits', 'nutrition_logs', 'body_metrics', 'challenge_pool',
  'daily_challenges', 'coach_messages', 'coach_conversations', '__drizzle_migrations',
]

const REMOVED_PROFILE_COLUMNS = [
  'daily_calorie_target', 'daily_protein_target_g', 'daily_water_target_ml',
  'ollama_model', 'ollama_url',
]

/** JSON-safe dump of every row of every table (raw column names). */
function dumpAllTables(db: DatabaseSync): Record<string, Row[]> {
  const out: Record<string, Row[]> = {}
  const tables = all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  for (const { name } of tables) out[String(name)] = all(db, `SELECT * FROM ${q(String(name))}`)
  return out
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) return { __base64: Buffer.from(value).toString('base64') }
  return value
}

function v2Cleanup({ db, backupDir, now }: MigrationCtx): void {
  // (a) Complete JSON dump BEFORE anything is deleted. A failure aborts the migration.
  //     (A brand-new, completely empty database has nothing to save.)
  const dump = dumpAllTables(db)
  let file = '-'
  if (Object.values(dump).some(rows => rows.length > 0)) {
    fs.mkdirSync(backupDir, { recursive: true })
    file = uniquePath(path.join(backupDir, `vor-v2-alle-tabellen-${stamp(now)}`), '.json')
    fs.writeFileSync(file, JSON.stringify(dump, jsonReplacer, 2), 'utf-8')
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
      throw new Error(`JSON-Sicherung konnte nicht geschrieben werden: ${file}`)
    }
  }

  // (b) Drop removed modules' tables
  for (const t of REMOVED_TABLES) db.exec(`DROP TABLE IF EXISTS ${q(t)}`)

  // (c) Drop removed profile columns
  for (const c of REMOVED_PROFILE_COLUMNS) dropColumnIfExists(db, 'user_profile', c)

  // (d) Orphaned plan data (FKs were never enforced reliably in old databases).
  //     Top-down so children of deleted parents go along in the next step.
  if (tableExists(db, 'plan_phases') && tableExists(db, 'plan_weeks') && tableExists(db, 'plan_sessions')) {
    const phases = db.prepare('DELETE FROM plan_phases WHERE plan_id NOT IN (SELECT id FROM training_plans)').run().changes
    const weeks = db.prepare('DELETE FROM plan_weeks WHERE phase_id NOT IN (SELECT id FROM plan_phases)').run().changes
    const sessions = db.prepare('DELETE FROM plan_sessions WHERE week_id NOT IN (SELECT id FROM plan_weeks)').run().changes
    const links = db.prepare(
      'UPDATE plan_sessions SET linked_activity_id = NULL ' +
      'WHERE linked_activity_id IS NOT NULL AND linked_activity_id NOT IN (SELECT id FROM activities)'
    ).run().changes
    if (Number(phases) + Number(weeks) + Number(sessions) + Number(links) > 0) console.log(
      `[migration v2] verwaiste Plan-Daten gelöscht: ${phases} Phasen, ${weeks} Wochen, ${sessions} Sessions; ` +
      `${links} tote Aktivitäts-Verknüpfungen entfernt (JSON-Sicherung: ${file})`
    )
  }
  // (e) daily_checkins and recovery_logs stay untouched.
}

// ── v3: Trainingsplan v2 ─────────────────────────────────────────────────────

/**
 * Plan mit Startdatum, Wochen mit Index, Einheiten mit Distanz/Pace/Intervallen.
 * `plan_phases` entfällt. Die alten Zeilen werden mit `convertLegacyPlans` umgewandelt
 * (gleiche Funktion wie beim Backup-Import), in `*_new`-Tabellen geschrieben, dann
 * werden die alten Tabellen ersetzt.
 */
function v3PlanV2({ db }: MigrationCtx): void {
  const legacy = {
    plans: all(db, 'SELECT id, name, goal_event AS goalEvent, goal_date AS goalDate, is_active AS isActive, created_at AS createdAt FROM training_plans'),
    phases: all(db, 'SELECT id, plan_id AS planId, name, order_index AS orderIndex, duration_weeks AS durationWeeks FROM plan_phases'),
    weeks: all(db, 'SELECT id, phase_id AS phaseId, week_number AS weekNumber, notes FROM plan_weeks'),
    sessions: all(db,
      'SELECT id, week_id AS weekId, day_of_week AS dayOfWeek, type, target_duration_min AS targetDurationMin, ' +
      'target_hr_zone AS targetHrZone, intensity_label AS intensityLabel, coaching_note AS coachingNote, status, ' +
      'linked_activity_id AS linkedActivityId, completed_at AS completedAt, completion_note AS completionNote FROM plan_sessions'),
    activities: all(db, 'SELECT id, date FROM activities'),
  }
  const converted = convertLegacyPlans(legacy as unknown as Parameters<typeof convertLegacyPlans>[0])

  db.exec(`
    CREATE TABLE training_plans_new (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text NOT NULL,
      goal_event text,
      goal_date text,
      start_date text NOT NULL,
      is_active integer DEFAULT 1 NOT NULL,
      created_at integer NOT NULL
    );
    CREATE TABLE plan_weeks_new (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      plan_id integer NOT NULL REFERENCES training_plans(id) ON DELETE cascade,
      week_index integer NOT NULL,
      phase text,
      notes text,
      UNIQUE(plan_id, week_index)
    );
    CREATE TABLE plan_sessions_new (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      week_id integer NOT NULL REFERENCES plan_weeks(id) ON DELETE cascade,
      day_of_week integer NOT NULL,
      type text NOT NULL,
      title text,
      target_distance_km real,
      target_duration_min real,
      target_pace_fast_sec integer,
      target_pace_slow_sec integer,
      target_hr_zone integer,
      steps text,
      coaching_note text,
      status text DEFAULT 'planned' NOT NULL,
      linked_activity_id integer REFERENCES activities(id) ON DELETE set null,
      match_source text,
      completed_at integer,
      completion_note text
    );
  `)

  const insPlan = db.prepare(
    'INSERT INTO training_plans_new (id, name, goal_event, goal_date, start_date, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (const p of converted.plans) insPlan.run(p.id, p.name, p.goalEvent, p.goalDate, p.startDate, p.isActive, p.createdAt)
  const insWeek = db.prepare('INSERT INTO plan_weeks_new (id, plan_id, week_index, phase, notes) VALUES (?, ?, ?, ?, ?)')
  for (const w of converted.weeks) insWeek.run(w.id, w.planId, w.weekIndex, w.phase, w.notes)
  const insSession = db.prepare(
    'INSERT INTO plan_sessions_new (id, week_id, day_of_week, type, title, target_distance_km, target_duration_min, ' +
    'target_pace_fast_sec, target_pace_slow_sec, target_hr_zone, steps, coaching_note, status, linked_activity_id, ' +
    'match_source, completed_at, completion_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  for (const s of converted.sessions) {
    insSession.run(s.id, s.weekId, s.dayOfWeek, s.type, s.title, s.targetDistanceKm, s.targetDurationMin,
      s.targetPaceFastSec, s.targetPaceSlowSec, s.targetHrZone, s.steps, s.coachingNote, s.status,
      s.linkedActivityId, s.matchSource, s.completedAt, s.completionNote)
  }

  db.exec(`
    DROP TABLE plan_sessions;
    DROP TABLE plan_weeks;
    DROP TABLE plan_phases;
    DROP TABLE training_plans;
    ALTER TABLE training_plans_new RENAME TO training_plans;
    ALTER TABLE plan_weeks_new RENAME TO plan_weeks;
    ALTER TABLE plan_sessions_new RENAME TO plan_sessions;
    CREATE INDEX plan_sessions_week_idx ON plan_sessions(week_id);
    CREATE INDEX plan_sessions_activity_idx ON plan_sessions(linked_activity_id);
  `)
}

// ── v4: Garmin-Details (Höhe, Splits, Verläufe, externe ID), App-Einstellungen, Schlafdauer ──
function v4GarminDetails({ db }: MigrationCtx): void {
  db.exec(`
    ALTER TABLE activities ADD COLUMN elevation_gain_m real;
    ALTER TABLE activities ADD COLUMN elevation_loss_m real;
    ALTER TABLE activities ADD COLUMN moving_time_min real;
    ALTER TABLE activities ADD COLUMN external_id text;
    CREATE UNIQUE INDEX activities_external_id_uix ON activities(external_id) WHERE external_id IS NOT NULL;
    CREATE TABLE activity_splits (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      activity_id integer NOT NULL REFERENCES activities(id) ON DELETE cascade,
      split_index integer NOT NULL,
      distance_km real NOT NULL,
      duration_sec real NOT NULL,
      pace_sec_per_km real,
      avg_hr integer,
      elevation_gain_m real,
      elevation_loss_m real,
      UNIQUE(activity_id, split_index)
    );
    CREATE TABLE activity_streams (
      activity_id integer PRIMARY KEY NOT NULL REFERENCES activities(id) ON DELETE cascade,
      data text NOT NULL
    );
    CREATE TABLE app_settings (
      key text PRIMARY KEY NOT NULL,
      value text NOT NULL
    );
    ALTER TABLE recovery_logs ADD COLUMN sleep_hours real;
  `)
}

// ── v5: Laufschuhe, Befinden (aus Check-in), Tageswechsel-Stunde ──
function v5ShoesFeeling({ db }: MigrationCtx): void {
  db.exec(`
    CREATE TABLE shoes (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text NOT NULL,
      brand text,
      start_km real NOT NULL DEFAULT 0,
      max_km real NOT NULL DEFAULT 700,
      retired integer NOT NULL DEFAULT 0,
      is_default integer NOT NULL DEFAULT 0,
      created_at integer NOT NULL
    );
    ALTER TABLE activities ADD COLUMN shoe_id integer REFERENCES shoes(id) ON DELETE SET NULL;
    CREATE INDEX activities_shoe_idx ON activities(shoe_id);
    ALTER TABLE recovery_logs ADD COLUMN feeling integer;
    ALTER TABLE user_profile ADD COLUMN day_start_hour integer NOT NULL DEFAULT 4;
  `)
  // Befinden aus dem Morgen-Check-in übernehmen (daily_checkins bleibt unverändert)
  db.exec(`
    UPDATE recovery_logs
       SET feeling = (SELECT c.morning_energy FROM daily_checkins c WHERE c.date = recovery_logs.date)
     WHERE feeling IS NULL
       AND EXISTS (SELECT 1 FROM daily_checkins c WHERE c.date = recovery_logs.date AND c.morning_energy IS NOT NULL);
    INSERT INTO recovery_logs (date, feeling, source, created_at, updated_at)
      SELECT c.date, c.morning_energy, 'manual', c.created_at, c.updated_at
        FROM daily_checkins c
       WHERE c.morning_energy IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM recovery_logs r WHERE r.date = c.date);
  `)
}

/** v6: Feedback nach dem Lauf, Leistungszahl, Plan-Vorschläge (Auto-Anpassung). */
function v6PlanAdapt({ db }: MigrationCtx): void {
  db.exec(`
    ALTER TABLE activities ADD COLUMN pain integer;
    ALTER TABLE activities ADD COLUMN feedback_at integer;
    ALTER TABLE user_profile ADD COLUMN current_10k_sec integer;
    CREATE TABLE plan_proposals (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      plan_id integer NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
      activity_id integer REFERENCES activities(id) ON DELETE SET NULL,
      kind text NOT NULL,
      meta text NOT NULL DEFAULT '{}',
      changes text NOT NULL,
      reasons text NOT NULL,
      status text NOT NULL DEFAULT 'open',
      created_at integer NOT NULL,
      resolved_at integer
    );
    CREATE INDEX plan_proposals_status_idx ON plan_proposals(status, kind);
  `)
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'baseline', up: v1Baseline },
  { version: 2, name: 'phase-1-cleanup', up: v2Cleanup },
  { version: 3, name: 'plan-v2', up: v3PlanV2 },
  { version: 4, name: 'garmin-details', up: v4GarminDetails },
  { version: 5, name: 'shoes-feeling', up: v5ShoesFeeling },
  { version: 6, name: 'plan-adapt', up: v6PlanAdapt },
]

// ── Runner ───────────────────────────────────────────────────────────────────

export interface MigrationResult {
  from: number
  to: number
  /** path of the pre-migration copy, if one was made */
  backupPath: string | null
}

export interface RunOptions {
  migrations?: readonly Migration[]
  now?: Date
}

/**
 * Bring the database to the newest schema version. Throws on any failure
 * (the failing migration is rolled back; earlier ones stay applied).
 */
export function runMigrations(db: DatabaseSync, backupDir: string, opts: RunOptions = {}): MigrationResult {
  const migrations = opts.migrations ?? MIGRATIONS
  const now = opts.now ?? new Date()
  const latest = migrations.reduce((m, x) => Math.max(m, x.version), 0)
  const from = getUserVersion(db)

  if (from > latest) {
    throw new Error(
      `Die Datenbank hat Version ${from}, diese App kennt nur bis Version ${latest}. ` +
      'Bitte die neuere FitCoach-Version verwenden.'
    )
  }
  const pending = migrations.filter(m => m.version > from).sort((a, b) => a.version - b.version)
  if (pending.length === 0) return { from, to: from, backupPath: null }

  // Safety copy of an existing database before touching it. Failure aborts everything.
  let backupPath: string | null = null
  if (from > 0 || tableExists(db, 'activities')) {
    backupPath = uniquePath(path.join(backupDir, `vor-migration-v${from}-v${latest}-${stamp(now)}`), '.db')
    vacuumInto(db, backupPath)
  }

  const fkWasOn = getForeignKeys(db)
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    pending.forEach((m, i) => {
      const isLast = i === pending.length - 1
      db.exec('BEGIN IMMEDIATE')
      try {
        m.up({ db, backupDir, now })
        if (isLast) {
          const bad = all(db, 'PRAGMA foreign_key_check')
          if (bad.length > 0) {
            throw new Error(
              `Fremdschlüssel-Prüfung nach Migration v${m.version} fehlgeschlagen ` +
              `(${bad.length} Verstöße, z. B. ${JSON.stringify(bad[0])})`
            )
          }
        }
        db.exec(`PRAGMA user_version = ${m.version}`)
        db.exec('COMMIT')
      } catch (err) {
        if (db.isTransaction) {
          try { db.exec('ROLLBACK') } catch { /* keep original error */ }
        }
        throw new Error(
          `Migration v${m.version} (${m.name}) fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    })
  } finally {
    if (fkWasOn) db.exec('PRAGMA foreign_keys = ON')
  }

  return { from, to: getUserVersion(db), backupPath }
}
