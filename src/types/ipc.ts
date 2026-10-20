import type {
  CreateActivityPayload, ListActivitiesPayload, CreatePlanPayload, AdaptPlanPayload,
  CreateEmptyPlanPayload, UpdatePlanPayload, UpdateWeekPayload, CreateSessionPayload, UpdateSessionPayload,
  UpdateSessionStatusPayload, LinkSessionActivityPayload, SummaryPayload,
  UpsertCheckinPayload, UpsertRecoveryLogPayload, UpdateActivityPayload, SaveShoePayload, SetFeelingPayload,
  ActivityType, ActivitySource, HrZoneDistribution, StrengthExercise,
  SessionType, SessionStatus, RecoverySource, PlanStep, PlanBlock,
} from './ipcContract'

// Payload types are derived from the Zod schemas in ipcContract.ts (single source of truth)
export type {
  CreateActivityPayload, ListActivitiesPayload, CreatePlanPayload, AdaptPlanPayload,
  CreateEmptyPlanPayload, UpdatePlanPayload, UpdateWeekPayload, CreateSessionPayload, UpdateSessionPayload,
  UpdateSessionStatusPayload, LinkSessionActivityPayload, SummaryPayload,
  UpsertCheckinPayload, UpsertRecoveryLogPayload, UpdateActivityPayload, SaveShoePayload, SetFeelingPayload,
  ActivityType, ActivitySource, HrZoneDistribution, StrengthExercise,
  SessionType, SessionStatus, RecoverySource, PlanStep, PlanBlock,
}

// All IPC channel names — no magic strings anywhere else
export const IPC = {
  // Activities
  ACTIVITIES_CREATE: 'activities:create',
  ACTIVITIES_LIST: 'activities:list',
  ACTIVITIES_GET: 'activities:get',
  ACTIVITIES_DELETE: 'activities:delete',
  ACTIVITIES_DETAILS: 'activities:details',
  ACTIVITIES_UPDATE: 'activities:update',
  ACTIVITIES_RESTORE: 'activities:restore',

  // Laufschuhe
  SHOES_LIST: 'shoes:list',
  SHOES_SAVE: 'shoes:save',
  SHOES_DELETE: 'shoes:delete',

  // Onboarding
  ONBOARDING_STATUS: 'onboarding:status',
  ONBOARDING_COMPLETE: 'onboarding:complete',

  // Garmin
  GARMIN_IMPORT_FILES: 'garmin:importFiles',

  // intervals.icu
  INTERVALS_STATUS: 'intervals:status',
  INTERVALS_SET_KEY: 'intervals:setKey',
  INTERVALS_CLEAR_KEY: 'intervals:clearKey',
  INTERVALS_SYNC: 'intervals:sync',

  // Plans
  PLANS_CREATE: 'plans:create',
  PLANS_CREATE_EMPTY: 'plans:createEmpty',
  PLANS_UPDATE: 'plans:update',
  PLANS_LIST: 'plans:list',
  PLANS_GET: 'plans:get',
  PLANS_TODAY: 'plans:today',
  PLANS_DELETE: 'plans:delete',
  PLANS_ACTIVATE: 'plans:activate',
  PLAN_WEEK_UPDATE: 'planWeeks:update',
  SESSIONS_CREATE: 'sessions:create',
  SESSIONS_UPDATE: 'sessions:update',
  SESSIONS_DELETE: 'sessions:delete',
  SESSIONS_UPDATE_STATUS: 'sessions:updateStatus',
  SESSIONS_LINK_ACTIVITY: 'sessions:linkActivity',
  PLANS_ADAPT: 'plans:adapt',

  // Stats
  STATS_GET: 'stats:get',

  // Coach
  COACH_STATUS: 'coach:status',
  COACH_APPLY_CHANGES: 'coach:applyChanges',

  // Plan-Anpassung
  ADAPT_PENDING_FEEDBACK: 'adapt:pendingFeedback',
  ADAPT_FEEDBACK: 'adapt:feedback',
  ADAPT_PROPOSALS: 'adapt:proposals',
  ADAPT_APPLY: 'adapt:apply',
  ADAPT_REJECT: 'adapt:reject',
  ADAPT_NOT_FULL: 'adapt:notFull',
  ADAPT_PACE_STATUS: 'adapt:paceStatus',
  ADAPT_SET_PERFORMANCE: 'adapt:setPerformance',

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

  // App settings (OS-level)
  AUTOSTART_GET: 'settings:autostartGet',
  AUTOSTART_SET: 'settings:autostartSet',

  // Daily Check-in
  CHECKIN_GET: 'checkin:get',
  CHECKIN_UPSERT: 'checkin:upsert',

  // Recovery
  RECOVERY_LOG_UPSERT: 'recovery:upsert',
  RECOVERY_LOGS_GET:   'recovery:logsGet',
  RECOVERY_LOG_DELETE: 'recovery:delete',
  RECOVERY_SET_FEELING: 'recovery:setFeeling',

  // App-Info & Updates
  APP_INFO: 'app:info',
  UPDATE_STATUS: 'update:status',
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install',

} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

// Standard response envelope — every handler returns this
export type IpcResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── Activity types ────────────────────────────────────────────────────────────

export interface ActivityRow extends CreateActivityPayload {
  id: number
  createdAt: number
  shoeId?: number
}

/** Zustand des Auto-Updates (wird im Main gehalten). */
export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'disabled'
  version?: string
  percent?: number
  message?: string
}

/** Laufschuh mit berechneter Laufleistung (Start-km + alle Läufe mit diesem Schuh). */
export interface Shoe {
  id: number
  name: string
  brand?: string
  startKm: number
  maxKm: number
  retired: boolean
  isDefault: boolean
  totalKm: number
  runCount: number
  createdAt: number
}

export interface ActivitySplit {
  splitIndex: number // 1-basiert
  distanceKm: number
  durationSec: number
  paceSecPerKm?: number
  avgHr?: number
  elevationGainM?: number
  elevationLossM?: number
}

/** Verkleinerte Verläufe (max. 500 Punkte), alle Arrays gleich lang. */
export interface ActivityStreams {
  t: number[]                // Sekunden ab Start
  distKm: (number | null)[]
  hr: (number | null)[]
  paceSec: (number | null)[] // s/km
  altM: (number | null)[]
}

export interface ImportFileResult {
  fileName: string
  status: 'created' | 'duplicate' | 'error'
  activityId?: number
  message?: string
}

/** Ergebnis eines intervals.icu-Syncs. */
export interface SyncResult {
  created: number
  duplicates: number
  unavailable: number
  recoveryDays: number
  errors: string[]
  from: string // YYYY-MM-DD
  to: string   // YYYY-MM-DD
  at: number   // ms
}

export interface IntervalsStatus {
  configured: boolean
  encryptionAvailable: boolean
  lastSyncAt?: number
  lastResult?: SyncResult
}

// ── Plan types ────────────────────────────────────────────────────────────────

export type MatchSource = 'auto' | 'manual'

export interface LinkedActivitySummary {
  id: number
  date: string
  type: string
  distanceKm: number | null
  durationMin: number | null
  avgHr: number | null
}

export interface PlanRow {
  id: number
  name: string
  goalEvent: string | null
  goalDate: string | null
  startDate: string // YYYY-MM-DD, immer ein Montag
  isActive: number
  createdAt: number
  weekCount: number
}

export interface SessionRow {
  id: number
  weekId: number
  weekIndex: number
  dayOfWeek: number
  date: string // berechnet: startDate + weekIndex·7 + (dayOfWeek − 1)
  type: SessionType
  title: string | null
  targetDistanceKm: number | null
  targetDurationMin: number | null
  targetPaceFastSec: number | null
  targetPaceSlowSec: number | null
  targetHrZone: number | null
  steps: PlanBlock[] | null
  coachingNote: string | null
  status: SessionStatus
  linkedActivityId: number | null
  matchSource: MatchSource | null
  completedAt: number | null
  completionNote: string | null
  activity: LinkedActivitySummary | null
}

export interface WeekDetail {
  id: number
  planId: number
  weekIndex: number
  phase: string | null
  notes: string | null
  from: string
  to: string
  sessions: SessionRow[]
}

export interface PlanDetail extends PlanRow {
  weeks: WeekDetail[]
}

export type PlanState = 'none' | 'before' | 'running' | 'finished'

export interface PlanTodayResult {
  plan: PlanRow | null
  state: PlanState
  today: string
  weekIndex: number | null
  todaySessions: SessionRow[]
  weekSessions: SessionRow[]
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
  /** Tageswechsel (0–12 Uhr), Standard 4 */
  dayStartHour?: number
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
  trainingLoad: number            // Σ TRIMP
}

export interface ZoneBucket {
  zone: string          // 'Z1'…'Z5' | 'Kein Puls'
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

// ── Recovery types ────────────────────────────────────────────────────────────


export interface RecoveryLog {
  id: number
  date: string              // YYYY-MM-DD
  hrvRmssd?: number         // ms
  bodyBattery?: number      // 0–100
  sleepScore?: number       // 0–100
  readinessScore?: number   // 0–100
  restingHr?: number        // bpm
  sleepHours?: number       // h
  feeling?: number          // 1–5 „Wie fühlst du dich?“
  note?: string
  source: RecoverySource
  createdAt: number
  updatedAt: number
}

/** Zustand des lokalen KI-Coachs (Ollama), wird im Main gehalten. */
export type LocalCoachStatus =
  | { state: 'idle' }
  | { state: 'connecting'; startedAt: number }
  | { state: 'generating'; startedAt: number; chars: number }
  | { state: 'done'; startedAt: number; finishedAt: number }
  | { state: 'error'; message: string; raw?: string }
  | { state: 'cancelled' }

/** Geprüfte Antwort des lokalen Coachs. */
export interface LocalCoachAnswer {
  explanation: string
  fitcoachChanges: { fitcoachChanges: 1; summary: string; changes: Record<string, unknown>[] }
}

/** Gespeichertes Ergebnis des letzten Laufs. */
export interface LocalCoachResult {
  answer: LocalCoachAnswer
  model: string
  /** ISO-Zeitstempel */
  createdAt: string
  dateFrom: string
  dateTo: string
}
