import { sqliteTable, integer, text, real, unique } from 'drizzle-orm/sqlite-core'

// ── Activities ────────────────────────────────────────────────────────────────
export const activities = sqliteTable('activities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // running | cycling | sleep | strength | custom
  date: text('date').notNull(), // YYYY-MM-DD
  createdAt: integer('created_at').notNull(),
  source: text('source').notNull(), // manual | garmin_import | intervals_icu
  garminFileName: text('garmin_file_name'),

  // Shared
  avgHr: integer('avg_hr'),
  maxHr: integer('max_hr'),
  durationMin: real('duration_min'),

  // Running
  startTime: text('start_time'),
  distanceKm: real('distance_km'),
  hrZoneDistribution: text('hr_zone_distribution'), // JSON
  perceivedEffort: integer('perceived_effort'),
  surfaceType: text('surface_type'),
  notes: text('notes'),

  // Cycling
  avgCadence: integer('avg_cadence'),

  // Sleep
  bedtime: text('bedtime'),
  wakeTime: text('wake_time'),
  sleepQuality: integer('sleep_quality'),

  // Strength
  exercises: text('exercises'), // JSON

  // Custom
  typeLabel: text('type_label'),

  // Garmin raw
  rawGarminData: text('raw_garmin_data'), // JSON (kompakt, ohne Samples)

  // Phase 3
  elevationGainM: real('elevation_gain_m'),
  elevationLossM: real('elevation_loss_m'),
  movingTimeMin: real('moving_time_min'),
  externalId: text('external_id'), // z. B. icu:i12345; UNIQUE-Index (partiell) per Migration v4
})

export const activitySplits = sqliteTable('activity_splits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  activityId: integer('activity_id')
    .notNull()
    .references(() => activities.id, { onDelete: 'cascade' }),
  splitIndex: integer('split_index').notNull(), // 1-basiert
  distanceKm: real('distance_km').notNull(),
  durationSec: real('duration_sec').notNull(),
  paceSecPerKm: real('pace_sec_per_km'),
  avgHr: integer('avg_hr'),
  elevationGainM: real('elevation_gain_m'),
  elevationLossM: real('elevation_loss_m'),
}, t => [unique().on(t.activityId, t.splitIndex)])

export const activityStreams = sqliteTable('activity_streams', {
  activityId: integer('activity_id')
    .primaryKey()
    .references(() => activities.id, { onDelete: 'cascade' }),
  data: text('data').notNull(), // JSON ActivityStreams
})

// Geheimnisse (z. B. verschlüsselter API-Schlüssel) – wird NIE exportiert
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

// ── Training Plans ────────────────────────────────────────────────────────────
export const trainingPlans = sqliteTable('training_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  goalEvent: text('goal_event'),
  goalDate: text('goal_date'),
  startDate: text('start_date').notNull(), // YYYY-MM-DD, immer ein Montag
  isActive: integer('is_active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
})

export const planWeeks = sqliteTable('plan_weeks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planId: integer('plan_id')
    .notNull()
    .references(() => trainingPlans.id, { onDelete: 'cascade' }),
  weekIndex: integer('week_index').notNull(), // 0-basiert, UNIQUE(plan_id, week_index)
  phase: text('phase'),
  notes: text('notes'),
})

export const planSessions = sqliteTable('plan_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  weekId: integer('week_id')
    .notNull()
    .references(() => planWeeks.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(), // 1=Mo … 7=So
  type: text('type').notNull(), // running | cycling | strength | rest | custom
  title: text('title'),
  targetDistanceKm: real('target_distance_km'),
  targetDurationMin: real('target_duration_min'),
  targetPaceFastSec: integer('target_pace_fast_sec'), // Sekunden pro km
  targetPaceSlowSec: integer('target_pace_slow_sec'),
  targetHrZone: integer('target_hr_zone'),
  steps: text('steps'), // JSON (Intervall-Schritte)
  coachingNote: text('coaching_note'),
  status: text('status').notNull().default('planned'), // planned | completed | skipped
  linkedActivityId: integer('linked_activity_id').references(() => activities.id, {
    onDelete: 'set null',
  }),
  matchSource: text('match_source'), // auto | manual | NULL
  completedAt: integer('completed_at'),
  completionNote: text('completion_note'),
})

// ── User Profile (single row, id = 1) ────────────────────────────────────────
export const userProfile = sqliteTable('user_profile', {
  id: integer('id').primaryKey(),
  name: text('name'),
  age: integer('age'),
  maxHr: integer('max_hr'),
  restingHr: integer('resting_hr'),
  goalEvent: text('goal_event'),
  goalFinishTime: text('goal_finish_time'),
  trainingDaysPerWeek: integer('training_days_per_week'),
  fixedRestDays: text('fixed_rest_days'), // JSON [0,6]
  injuryNotes: text('injury_notes'),
  theme: text('theme').notNull().default('dark'),
  weeklyGoalKm: real('weekly_goal_km'),
  weeklyGoalSessions: integer('weekly_goal_sessions'),
})

export const hrZones = sqliteTable('hr_zones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  zoneNumber: integer('zone_number').notNull(),
  minHr: integer('min_hr').notNull(),
  maxHr: integer('max_hr').notNull(),
  label: text('label').notNull(),
})

// ── Check-ins & Recovery ─────────────────────────────────────────────────────

export const dailyCheckins = sqliteTable('daily_checkins', {
  id:                integer('id').primaryKey({ autoIncrement: true }),
  date:              text('date').notNull().unique(), // YYYY-MM-DD
  morningEnergy:     integer('morning_energy'),       // 1–5
  morningClarity:    integer('morning_clarity'),      // 1–5
  morningIntention:  text('morning_intention'),
  eveningRating:     integer('evening_rating'),       // 1–5
  eveningWins:       text('evening_wins'),
  eveningNote:       text('evening_note'),
  createdAt:         integer('created_at').notNull(),
  updatedAt:         integer('updated_at').notNull(),
})

export const recoveryLogs = sqliteTable('recovery_logs', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  date:           text('date').notNull().unique(),   // YYYY-MM-DD, one row per day
  hrvRmssd:       real('hrv_rmssd'),                 // ms — the RMSSD HRV value
  bodyBattery:    integer('body_battery'),            // 0–100
  sleepScore:     integer('sleep_score'),             // 0–100
  readinessScore: integer('readiness_score'),         // 0–100
  restingHr:      integer('resting_hr'),              // bpm
  sleepHours:     real('sleep_hours'),                // h
  note:           text('note'),
  source:         text('source').notNull().default('manual'),  // manual | garmin_import | intervals_icu
  createdAt:      integer('created_at').notNull(),
  updatedAt:      integer('updated_at').notNull(),
})
