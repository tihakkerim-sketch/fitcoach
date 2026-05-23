import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'

// ── Activities ────────────────────────────────────────────────────────────────
export const activities = sqliteTable('activities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // running | cycling | sleep | strength | custom
  date: text('date').notNull(), // YYYY-MM-DD
  createdAt: integer('created_at').notNull(),
  source: text('source').notNull(), // manual | garmin_import
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
  rawGarminData: text('raw_garmin_data'), // JSON
})

// ── Training Plans ────────────────────────────────────────────────────────────
export const trainingPlans = sqliteTable('training_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  goalEvent: text('goal_event'),
  goalDate: text('goal_date'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
})

export const planPhases = sqliteTable('plan_phases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planId: integer('plan_id')
    .notNull()
    .references(() => trainingPlans.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull(),
  durationWeeks: integer('duration_weeks').notNull(),
})

export const planWeeks = sqliteTable('plan_weeks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phaseId: integer('phase_id')
    .notNull()
    .references(() => planPhases.id, { onDelete: 'cascade' }),
  weekNumber: integer('week_number').notNull(),
  notes: text('notes'),
})

export const planSessions = sqliteTable('plan_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  weekId: integer('week_id')
    .notNull()
    .references(() => planWeeks.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(), // 0=Mon … 6=Sun
  type: text('type').notNull(), // running | cycling | strength | rest | custom
  targetDurationMin: integer('target_duration_min'),
  targetHrZone: integer('target_hr_zone'),
  intensityLabel: text('intensity_label'),
  coachingNote: text('coaching_note'),
  status: text('status').notNull().default('planned'), // planned | completed | skipped
  linkedActivityId: integer('linked_activity_id').references(() => activities.id, {
    onDelete: 'set null',
  }),
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
  dailyCalorieTarget: integer('daily_calorie_target'),
  dailyProteinTargetG: real('daily_protein_target_g'),
  dailyWaterTargetMl: integer('daily_water_target_ml'),
})

export const hrZones = sqliteTable('hr_zones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  zoneNumber: integer('zone_number').notNull(),
  minHr: integer('min_hr').notNull(),
  maxHr: integer('max_hr').notNull(),
  label: text('label').notNull(),
})

// ── Performance OS ───────────────────────────────────────────────────────────

export const habits = sqliteTable('habits', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  name:       text('name').notNull(),
  emoji:      text('emoji').notNull().default('⚡'),
  color:      text('color').notNull().default('blue'),  // blue|green|orange|purple|rose
  createdAt:  integer('created_at').notNull(),
  archivedAt: integer('archived_at'),
})

export const habitLogs = sqliteTable('habit_logs', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  habitId:     integer('habit_id').notNull().references(() => habits.id, { onDelete: 'cascade' }),
  date:        text('date').notNull(),         // YYYY-MM-DD
  completedAt: integer('completed_at').notNull(),
})

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
  note:           text('note'),
  source:         text('source').notNull().default('manual'),  // manual | garmin_import
  createdAt:      integer('created_at').notNull(),
  updatedAt:      integer('updated_at').notNull(),
})

export const nutritionLogs = sqliteTable('nutrition_logs', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  date:       text('date').notNull(),       // YYYY-MM-DD
  label:      text('label'),                // Breakfast | Lunch | Dinner | Snack | Water | Other
  calories:   integer('calories'),          // kcal
  proteinG:   real('protein_g'),            // grams
  waterMl:    integer('water_ml'),          // millilitres
  note:       text('note'),
  createdAt:  integer('created_at').notNull(),
})

export const bodyMetrics = sqliteTable('body_metrics', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  date:        text('date').notNull(),   // YYYY-MM-DD
  weightKg:    real('weight_kg'),
  bodyFatPct:  real('body_fat_pct'),
  note:        text('note'),
  createdAt:   integer('created_at').notNull(),
})

// ── Daily Challenges ──────────────────────────────────────────────────────────

export const challengePool = sqliteTable('challenge_pool', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  text:      text('text').notNull(),
  category:  text('category').notNull().default('fitness'), // fitness|mindset|nutrition|mobility|custom
  isBuiltIn: integer('is_built_in').notNull().default(0),   // 1 = cannot be deleted
  isActive:  integer('is_active').notNull().default(1),     // 1 = eligible for daily picks
})

export const dailyChallenges = sqliteTable('daily_challenges', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  date:        text('date').notNull(),            // YYYY-MM-DD
  poolId:      integer('pool_id'),               // nullable — pool entry may later be deleted
  text:        text('text').notNull(),            // snapshot of text at generation time
  completed:   integer('completed').notNull().default(0),  // 0 | 1
  completedAt: integer('completed_at'),
})

