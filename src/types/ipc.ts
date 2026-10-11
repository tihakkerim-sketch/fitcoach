import type {
  CreateActivityPayload, ListActivitiesPayload, CreatePlanPayload, AdaptPlanPayload,
  UpdateSessionStatusPayload, LinkSessionActivityPayload, SummaryPayload,
  UpsertCheckinPayload, UpsertRecoveryLogPayload,
  ActivityType, ActivitySource, HrZoneDistribution, StrengthExercise,
  SessionType, SessionStatus, RecoverySource,
} from './ipcContract'

// Payload types are derived from the Zod schemas in ipcContract.ts (single source of truth)
export type {
  CreateActivityPayload, ListActivitiesPayload, CreatePlanPayload, AdaptPlanPayload,
  UpdateSessionStatusPayload, LinkSessionActivityPayload, SummaryPayload,
  UpsertCheckinPayload, UpsertRecoveryLogPayload,
  ActivityType, ActivitySource, HrZoneDistribution, StrengthExercise,
  SessionType, SessionStatus, RecoverySource,
}

// All IPC channel names — no magic strings anywhere else
export const IPC = {
  // Activities
  ACTIVITIES_CREATE: 'activities:create',
  ACTIVITIES_LIST: 'activities:list',
  ACTIVITIES_GET: 'activities:get',
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
}

// ── Plan types ────────────────────────────────────────────────────────────────

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
  note?: string
  source: RecoverySource
  createdAt: number
  updatedAt: number
}
