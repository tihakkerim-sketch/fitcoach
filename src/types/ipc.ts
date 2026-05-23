// All IPC channel names — no magic strings anywhere else
export const IPC = {
  // Activities
  ACTIVITIES_CREATE: 'activities:create',
  ACTIVITIES_LIST: 'activities:list',
  ACTIVITIES_GET: 'activities:get',
  ACTIVITIES_UPDATE: 'activities:update',
  ACTIVITIES_DELETE: 'activities:delete',

  // Garmin
  GARMIN_PARSE: 'garmin:parse',

  // Plans
  PLANS_CREATE: 'plans:create',
  PLANS_LIST: 'plans:list',
  PLANS_GET: 'plans:get',
  PLANS_DELETE: 'plans:delete',
  PLANS_ACTIVATE: 'plans:activate',
  SESSIONS_UPDATE_STATUS: 'sessions:updateStatus',
  SESSIONS_LINK_ACTIVITY: 'sessions:linkActivity',
  PLANS_ADAPT: 'plans:adapt',

  // Stats
  STATS_GET: 'stats:get',

  // Export
  EXPORT_GENERATE_SUMMARY: 'export:generateSummary',
  EXPORT_SAVE_MD: 'export:saveMd',

  // Profile
  PROFILE_GET: 'profile:get',
  PROFILE_SAVE: 'profile:save',
  HR_ZONES_GET: 'hrZones:get',
  HR_ZONES_SAVE: 'hrZones:save',

  // Data export/import
  DATA_EXPORT: 'data:export',
  DATA_IMPORT: 'data:import',

  // Habits
  HABITS_CREATE: 'habits:create',
  HABITS_LIST: 'habits:list',
  HABITS_DELETE: 'habits:delete',
  HABIT_LOG_TOGGLE: 'habits:logToggle',
  HABIT_LOGS_GET: 'habits:logsGet',

  // Daily Check-in
  CHECKIN_GET: 'checkin:get',
  CHECKIN_UPSERT: 'checkin:upsert',

  // Body Metrics
  BODY_CREATE: 'body:create',
  BODY_LIST: 'body:list',
  BODY_DELETE: 'body:delete',

  // Nutrition
  NUTRITION_LOG_CREATE: 'nutrition:logCreate',
  NUTRITION_LOGS_GET:   'nutrition:logsGet',
  NUTRITION_LOG_DELETE: 'nutrition:logDelete',

  // Recovery
  RECOVERY_LOG_UPSERT: 'recovery:upsert',
  RECOVERY_LOGS_GET:   'recovery:logsGet',
  RECOVERY_LOG_DELETE: 'recovery:delete',

  // Daily Challenges
  CHALLENGES_TODAY_GET:         'challenges:todayGet',
  CHALLENGE_TOGGLE:             'challenges:toggle',
  CHALLENGE_POOL_LIST:          'challenges:poolList',
  CHALLENGE_POOL_ADD:           'challenges:poolAdd',
  CHALLENGE_POOL_TOGGLE_ACTIVE: 'challenges:poolToggleActive',
  CHALLENGE_POOL_DELETE:        'challenges:poolDelete',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

// Standard response envelope — every handler returns this
export type IpcResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── Activity types ────────────────────────────────────────────────────────────
export type ActivityType = 'running' | 'cycling' | 'sleep' | 'strength' | 'custom'
export type ActivitySource = 'manual' | 'garmin_import'

export interface HrZoneDistribution {
  z1: number; z2: number; z3: number; z4: number; z5: number
}

export interface StrengthExercise {
  name: string; sets: number; reps: number
}

export interface CreateActivityPayload {
  type: ActivityType
  date: string
  source: ActivitySource
  garminFileName?: string
  avgHr?: number
  maxHr?: number
  durationMin?: number
  // Running
  startTime?: string
  distanceKm?: number
  hrZoneDistribution?: HrZoneDistribution
  perceivedEffort?: number
  surfaceType?: string
  notes?: string
  // Cycling
  avgCadence?: number
  // Sleep
  bedtime?: string
  wakeTime?: string
  sleepQuality?: number
  // Strength
  exercises?: StrengthExercise[]
  // Custom
  typeLabel?: string
  // Garmin raw
  rawGarminData?: Record<string, unknown>
}

export interface ActivityRow extends CreateActivityPayload {
  id: number
  createdAt: number
}

export interface ListActivitiesPayload {
  type?: ActivityType
  dateFrom?: string
  dateTo?: string
  source?: ActivitySource
  sortBy?: 'date' | 'duration' | 'avgHr'
  sortDir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

// ── Plan types ────────────────────────────────────────────────────────────────
export type SessionType = 'running' | 'cycling' | 'strength' | 'rest' | 'custom'
export type SessionStatus = 'planned' | 'completed' | 'skipped'

export interface CreatePlanPayload {
  name: string
  goalEvent?: string
  goalDate?: string
  phases: Array<{
    name: string
    orderIndex: number
    durationWeeks: number
    weeks: Array<{
      weekNumber: number
      notes?: string
      sessions: Array<{
        dayOfWeek: number
        type: SessionType
        targetDurationMin?: number
        targetHrZone?: number
        intensityLabel?: string
        coachingNote?: string
      }>
    }>
  }>
}

export interface PlanRow {
  id: number
  name: string
  goalEvent?: string
  goalDate?: string
  isActive: number
  createdAt: number
}

export interface SessionRow {
  id: number
  weekId: number
  dayOfWeek: number
  type: SessionType
  targetDurationMin?: number
  targetHrZone?: number
  intensityLabel?: string
  coachingNote?: string
  status: SessionStatus
  linkedActivityId?: number
  completedAt?: number
  completionNote?: string
}

export interface WeekDetail {
  id: number
  phaseId: number
  weekNumber: number
  notes?: string
  sessions: SessionRow[]
}

export interface PhaseDetail {
  id: number
  planId: number
  name: string
  orderIndex: number
  durationWeeks: number
  weeks: WeekDetail[]
}

export interface PlanDetail extends PlanRow {
  phases: PhaseDetail[]
}

export interface UpdateSessionStatusPayload {
  sessionId: number
  status: SessionStatus
  completedAt?: number
  completionNote?: string
}

export interface LinkSessionActivityPayload {
  sessionId: number
  activityId: number | null
}

export interface AdaptPlanPayload extends CreatePlanPayload {
  planId: number   // which existing plan to update
}

export interface AdaptPlanResult {
  preserved: number  // total completed/skipped sessions that existed
  restored: number   // how many were successfully matched back onto the new structure
}

// ── Profile types ─────────────────────────────────────────────────────────────
export interface UserProfile {
  id: number
  name?: string
  age?: number
  maxHr?: number
  restingHr?: number
  goalEvent?: string
  goalFinishTime?: string
  trainingDaysPerWeek?: number
  fixedRestDays?: number[]
  injuryNotes?: string
  theme: 'light' | 'dark' | 'system'
  weeklyGoalKm?: number
  weeklyGoalSessions?: number
  dailyCalorieTarget?: number
  dailyProteinTargetG?: number
  dailyWaterTargetMl?: number
}

export interface HrZone {
  id: number
  zoneNumber: number
  minHr: number
  maxHr: number
  label: string
}

// ── Stats types ───────────────────────────────────────────────────────────────
export interface WeeklyBucket {
  week: string              // 'YYYY-Www'
  label: string             // 'May 5'
  runKm: number
  cycleKm: number
  runMin: number
  cycleMin: number
  strengthSessions: number
  otherMin: number
  totalSessions: number           // all non-sleep activity count
  avgPaceSecPerKm: number | null  // null when no running that week
  trainingLoad: number            // Σ durationMin × zone multiplier
}

export interface ZoneBucket {
  zone: string          // 'Z1'…'Z5' | 'No HR'
  minutes: number
}

export interface ActivityTypeBucket {
  type: string
  count: number
}

export interface PersonalRecords {
  fastestPaceSecPerKm: number | null   // lowest sec/km across all single runs
  fastestPaceDate: string | null
  longestRunKm: number | null          // longest single run distance
  longestRunDate: string | null
  bestWeekKm: number | null            // best all-time week by run km
  bestWeekLabel: string | null         // human label, e.g. "May 5, 2025"
}

export interface StatsResult {
  totalActivities: number       // training only (sleep excluded)
  totalSleepSessions: number
  avgSleepQuality: number | null
  totalRunKm: number
  totalRunMin: number
  totalCycleKm: number
  totalStrengthSessions: number
  currentStreak: number
  longestStreak: number
  avgRunHr: number | null
  weekly: WeeklyBucket[]        // last 12 weeks
  zones: ZoneBucket[]
  byType: ActivityTypeBucket[]
  personalRecords: PersonalRecords
}

// ── Export types ──────────────────────────────────────────────────────────────
export interface SummaryPayload {
  dateFrom: string
  dateTo: string
}

// ── Habit types ───────────────────────────────────────────────────────────────
export type HabitColor = 'blue' | 'green' | 'orange' | 'purple' | 'rose'

export interface HabitRow {
  id: number
  name: string
  emoji: string
  color: HabitColor
  createdAt: number
  archivedAt?: number
}

export interface CreateHabitPayload {
  name: string
  emoji: string
  color: HabitColor
}

export interface HabitLogRow {
  id: number
  habitId: number
  date: string        // YYYY-MM-DD
  completedAt: number
}

/** date → habitId[] of completed habits on that date */
export type HabitLogsMap = Record<string, number[]>

// ── Check-in types ────────────────────────────────────────────────────────────
export interface DailyCheckin {
  id: number
  date: string             // YYYY-MM-DD
  morningEnergy?: number   // 1–5
  morningClarity?: number  // 1–5
  morningIntention?: string
  eveningRating?: number   // 1–5
  eveningWins?: string
  eveningNote?: string
  createdAt: number
  updatedAt: number
}

export interface UpsertCheckinPayload {
  date: string
  morningEnergy?: number
  morningClarity?: number
  morningIntention?: string
  eveningRating?: number
  eveningWins?: string
  eveningNote?: string
}

// ── Nutrition types ───────────────────────────────────────────────────────────

export type NutritionLabel = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Water' | 'Other'

export interface NutritionLogEntry {
  id: number
  date: string          // YYYY-MM-DD
  label?: string
  calories?: number     // kcal
  proteinG?: number     // grams
  waterMl?: number      // millilitres
  note?: string
  createdAt: number
}

export interface CreateNutritionLogPayload {
  date: string
  label?: string
  calories?: number
  proteinG?: number
  waterMl?: number
  note?: string
}

// ── Recovery types ────────────────────────────────────────────────────────────

export type RecoverySource = 'manual' | 'garmin_import'

export interface RecoveryLog {
  id: number
  date: string              // YYYY-MM-DD
  hrvRmssd?: number         // ms
  bodyBattery?: number      // 0–100
  sleepScore?: number       // 0–100
  readinessScore?: number   // 0–100
  restingHr?: number        // bpm
  note?: string
  source: RecoverySource
  createdAt: number
  updatedAt: number
}

export interface UpsertRecoveryLogPayload {
  date: string
  hrvRmssd?: number
  bodyBattery?: number
  sleepScore?: number
  restingHr?: number
  note?: string
  source?: RecoverySource
  // readinessScore is intentionally omitted — always auto-calculated from the other metrics
}

// ── Daily Challenge types ─────────────────────────────────────────────────────

export type ChallengeCategory = 'fitness' | 'mindset' | 'nutrition' | 'mobility' | 'custom'

export interface ChallengePoolEntry {
  id: number
  text: string
  category: ChallengeCategory
  isBuiltIn: boolean
  isActive: boolean
}

export interface DailyChallenge {
  id: number
  date: string           // YYYY-MM-DD
  poolId?: number        // nullable
  text: string           // snapshot
  completed: boolean
  completedAt?: number
}

export interface TodayChallengesResult {
  challenges: DailyChallenge[]
  streak: number         // consecutive complete days
}

export interface AddChallengePayload {
  text: string
  category: ChallengeCategory
}

// ── Body metric types ─────────────────────────────────────────────────────────
export interface BodyMetricRow {
  id: number
  date: string
  weightKg?: number
  bodyFatPct?: number
  note?: string
  createdAt: number
}

export interface CreateBodyMetricPayload {
  date: string
  weightKg?: number
  bodyFatPct?: number
  note?: string
}
