/**
 * IPC contract: for EVERY channel in `IPC` the input schema (Zod) and the result type.
 *
 * Shared by renderer and main process — no Node/Electron imports allowed here.
 *  - Renderer: `invoke()` derives argument and result types from this file.
 *  - Main:     `handle()` validates every incoming payload against `ipcInputs` before
 *              the handler runs.
 *
 * Bounds are intentionally not tighter than what the forms in `src/schemas` and the
 * import helpers allow, so valid user input is never rejected here.
 */
import { z } from 'zod'
import { IPC } from './ipc'
import type {
  IpcChannel,
  ActivityRow, PlanRow, PlanDetail, AdaptPlanResult, UserProfile, HrZone,
  StatsResult, DailyCheckin, RecoveryLog,
} from './ipc'

// ── Building blocks ───────────────────────────────────────────────────────────

/** Local calendar date, YYYY-MM-DD */
export const dateString = z.string().regex(
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  'Datum muss das Format JJJJ-MM-TT haben',
)
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Uhrzeit muss das Format HH:MM haben')
const id = z.number().int().positive()
const hr = z.number().int().min(30).max(300)
const duration = z.number().min(0).max(10080)
const shortText = z.string().max(200)
const longText = z.string().max(2000)

export const MAX_GARMIN_FILE_BYTES = 50 * 1024 * 1024
export const MAX_EXPORT_CONTENT_CHARS = 5_000_000

// ── Activities ────────────────────────────────────────────────────────────────

export const activityTypeSchema = z.enum(['running', 'cycling', 'sleep', 'strength', 'custom'])
export const activitySourceSchema = z.enum(['manual', 'garmin_import'])

export type ActivityType = z.infer<typeof activityTypeSchema>
export type ActivitySource = z.infer<typeof activitySourceSchema>

export const hrZoneDistributionSchema = z.object({
  z1: z.number().min(0).max(100),
  z2: z.number().min(0).max(100),
  z3: z.number().min(0).max(100),
  z4: z.number().min(0).max(100),
  z5: z.number().min(0).max(100),
})

export type HrZoneDistribution = z.infer<typeof hrZoneDistributionSchema>

export const strengthExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  sets: z.number().int().min(1).max(100),
  reps: z.number().int().min(1).max(10000),
})

export type StrengthExercise = z.infer<typeof strengthExerciseSchema>

export const createActivitySchema = z.object({
  type: activityTypeSchema,
  date: dateString,
  source: activitySourceSchema,
  garminFileName: z.string().max(255).optional(),
  avgHr: hr.optional(),
  maxHr: hr.optional(),
  durationMin: duration.optional(),
  startTime: timeString.optional(),
  distanceKm: z.number().min(0).max(2000).optional(),
  hrZoneDistribution: hrZoneDistributionSchema.optional(),
  perceivedEffort: z.number().int().min(1).max(10).optional(),
  surfaceType: z.enum(['road', 'trail', 'track', 'treadmill', 'other']).optional(),
  notes: longText.optional(),
  avgCadence: z.number().int().min(0).max(300).optional(),
  bedtime: timeString.optional(),
  wakeTime: timeString.optional(),
  sleepQuality: z.number().int().min(1).max(100).optional(),
  exercises: z.array(strengthExerciseSchema).max(200).optional(),
  typeLabel: z.string().max(100).optional(),
  rawGarminData: z.record(z.string(), z.unknown()).optional(),
})
export type CreateActivityPayload = z.infer<typeof createActivitySchema>

export const listActivitiesSchema = z.object({
  type: activityTypeSchema.optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
  source: activitySourceSchema.optional(),
  sortBy: z.enum(['date', 'duration', 'avgHr']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
})
export type ListActivitiesPayload = z.infer<typeof listActivitiesSchema>

// ── Garmin ────────────────────────────────────────────────────────────────────

export const garminParseSchema = z.object({
  fileName: z.string().min(1).max(255),
  /** Raw file bytes (structured clone transfers Uint8Array directly) */
  data: z.instanceof(Uint8Array).refine(
    b => b.byteLength <= MAX_GARMIN_FILE_BYTES,
    'Datei ist zu groß (max. 50 MB)',
  ),
})
export type GarminParsePayload = z.infer<typeof garminParseSchema>

// ── Plans ─────────────────────────────────────────────────────────────────────

export const sessionTypeSchema = z.enum(['running', 'cycling', 'strength', 'rest', 'custom'])
export const sessionStatusSchema = z.enum(['planned', 'completed', 'skipped'])

export type SessionType = z.infer<typeof sessionTypeSchema>
export type SessionStatus = z.infer<typeof sessionStatusSchema>

const planSessionSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7), // 1 = Mo … 7 = So
  type: sessionTypeSchema,
  targetDurationMin: z.number().min(0).max(1440).nullish(),
  targetHrZone: z.number().int().min(1).max(5).nullish(),
  intensityLabel: z.string().max(100).nullish(),
  coachingNote: longText.nullish(),
})

const planWeekSchema = z.object({
  weekNumber: z.number().int().min(1).max(520),
  notes: longText.nullish(),
  sessions: z.array(planSessionSchema).max(21),
})

const planPhaseSchema = z.object({
  name: shortText.min(1),
  orderIndex: z.number().int().min(0).max(100),
  durationWeeks: z.number().int().min(1).max(520),
  weeks: z.array(planWeekSchema).max(520),
})

export const createPlanSchema = z.object({
  name: shortText.min(1),
  goalEvent: shortText.nullish(),
  goalDate: dateString.nullish(),
  phases: z.array(planPhaseSchema).min(1).max(100),
})
export type CreatePlanPayload = z.infer<typeof createPlanSchema>

export const adaptPlanSchema = createPlanSchema.extend({ planId: id })
export type AdaptPlanPayload = z.infer<typeof adaptPlanSchema>

export const updateSessionStatusSchema = z.object({
  sessionId: id,
  status: sessionStatusSchema,
  completedAt: z.number().int().min(0).optional(),
  completionNote: longText.optional(),
})
export type UpdateSessionStatusPayload = z.infer<typeof updateSessionStatusSchema>

export const linkSessionActivitySchema = z.object({
  sessionId: id,
  activityId: id.nullable(),
})
export type LinkSessionActivityPayload = z.infer<typeof linkSessionActivitySchema>

// ── Export ────────────────────────────────────────────────────────────────────

export const summarySchema = z.object({ dateFrom: dateString, dateTo: dateString })
export type SummaryPayload = z.infer<typeof summarySchema>

export const saveMdSchema = z.object({
  content: z.string().max(MAX_EXPORT_CONTENT_CHARS),
  filename: z.string().min(1).max(200).refine(f => !/[\\/]/.test(f), 'Dateiname darf keinen Pfad enthalten'),
})

// ── Profile ───────────────────────────────────────────────────────────────────

// Fields read back from the DB can be null, and the profile object is sent back as a whole
// (including `id`, which is stripped) — so everything is nullish here.
export const saveProfileSchema = z.object({
  name: shortText.nullish(),
  age: z.number().int().min(5).max(120).nullish(),
  maxHr: hr.nullish(),
  restingHr: z.number().int().min(20).max(250).nullish(),
  goalEvent: shortText.nullish(),
  goalFinishTime: z.string().max(50).nullish(),
  trainingDaysPerWeek: z.number().int().min(1).max(7).nullish(),
  fixedRestDays: z.array(z.number().int().min(1).max(7)).max(7).nullish(),
  injuryNotes: longText.nullish(),
  theme: z.enum(['light', 'dark', 'system']).nullish(),
  weeklyGoalKm: z.number().min(0).max(2000).nullish(),
  weeklyGoalSessions: z.number().int().min(0).max(100).nullish(),
})
export type SaveProfilePayload = z.infer<typeof saveProfileSchema>

export const saveHrZonesSchema = z.array(z.object({
  id: id.optional(),
  zoneNumber: z.number().int().min(1).max(5),
  minHr: z.number().int().min(0).max(300),
  maxHr: z.number().int().min(0).max(300),
  label: z.string().max(100),
})).max(10)

// ── Check-in ──────────────────────────────────────────────────────────────────

const scale5 = z.number().int().min(1).max(5)

export const upsertCheckinSchema = z.object({
  date: dateString,
  morningEnergy: scale5.optional(),
  morningClarity: scale5.optional(),
  morningIntention: longText.optional(),
  eveningRating: scale5.optional(),
  eveningWins: longText.optional(),
  eveningNote: longText.optional(),
})
export type UpsertCheckinPayload = z.infer<typeof upsertCheckinSchema>

// ── Recovery ──────────────────────────────────────────────────────────────────

export const recoverySourceSchema = z.enum(['manual', 'garmin_import'])

export type RecoverySource = z.infer<typeof recoverySourceSchema>

// readinessScore is intentionally not accepted — always auto-calculated from the other metrics
export const upsertRecoveryLogSchema = z.object({
  date: dateString,
  hrvRmssd: z.number().min(0).max(500).optional(),
  bodyBattery: z.number().min(0).max(100).optional(),
  sleepScore: z.number().min(0).max(100).optional(),
  restingHr: z.number().min(20).max(250).optional(),
  note: z.string().max(1000).optional(),
  source: recoverySourceSchema.optional(),
})
export type UpsertRecoveryLogPayload = z.infer<typeof upsertRecoveryLogSchema>

export const recoveryRangeSchema = z.object({ dateFrom: dateString, dateTo: dateString })

// ── Contract maps ─────────────────────────────────────────────────────────────

/** Input schema per channel (`z.undefined()` = no input). */
export const ipcInputs = {
  [IPC.ACTIVITIES_CREATE]: createActivitySchema,
  [IPC.ACTIVITIES_LIST]: listActivitiesSchema,
  [IPC.ACTIVITIES_GET]: id,
  [IPC.ACTIVITIES_DELETE]: id,

  [IPC.GARMIN_PARSE]: garminParseSchema,

  [IPC.PLANS_CREATE]: createPlanSchema,
  [IPC.PLANS_LIST]: z.undefined(),
  [IPC.PLANS_GET]: id,
  [IPC.PLANS_DELETE]: id,
  [IPC.PLANS_ACTIVATE]: id,
  [IPC.SESSIONS_UPDATE_STATUS]: updateSessionStatusSchema,
  [IPC.SESSIONS_LINK_ACTIVITY]: linkSessionActivitySchema,
  [IPC.PLANS_ADAPT]: adaptPlanSchema,

  [IPC.STATS_GET]: z.undefined(),

  [IPC.EXPORT_GENERATE_SUMMARY]: summarySchema,
  [IPC.EXPORT_SAVE_MD]: saveMdSchema,

  [IPC.PROFILE_GET]: z.undefined(),
  [IPC.PROFILE_SAVE]: saveProfileSchema,
  [IPC.HR_ZONES_GET]: z.undefined(),
  [IPC.HR_ZONES_SAVE]: saveHrZonesSchema,

  // Backup file is chosen via a native dialog in the main process (size is checked there)
  [IPC.DATA_EXPORT]: z.undefined(),
  [IPC.DATA_IMPORT]: z.undefined(),

  [IPC.AUTOSTART_GET]: z.undefined(),
  [IPC.AUTOSTART_SET]: z.boolean(),

  [IPC.CHECKIN_GET]: dateString,
  [IPC.CHECKIN_UPSERT]: upsertCheckinSchema,

  [IPC.RECOVERY_LOG_UPSERT]: upsertRecoveryLogSchema,
  [IPC.RECOVERY_LOGS_GET]: recoveryRangeSchema,
  [IPC.RECOVERY_LOG_DELETE]: id,
} as const satisfies Record<IpcChannel, z.ZodType>

/** Result type (the `data` of a successful response) per channel. */
export interface IpcResults {
  [IPC.ACTIVITIES_CREATE]: ActivityRow
  [IPC.ACTIVITIES_LIST]: { activities: ActivityRow[]; total: number }
  [IPC.ACTIVITIES_GET]: ActivityRow | null
  [IPC.ACTIVITIES_DELETE]: void

  [IPC.GARMIN_PARSE]: Partial<CreateActivityPayload>

  [IPC.PLANS_CREATE]: PlanRow
  [IPC.PLANS_LIST]: PlanRow[]
  [IPC.PLANS_GET]: PlanDetail | null
  [IPC.PLANS_DELETE]: void
  [IPC.PLANS_ACTIVATE]: void
  [IPC.SESSIONS_UPDATE_STATUS]: void
  [IPC.SESSIONS_LINK_ACTIVITY]: void
  [IPC.PLANS_ADAPT]: AdaptPlanResult

  [IPC.STATS_GET]: StatsResult

  [IPC.EXPORT_GENERATE_SUMMARY]: string
  [IPC.EXPORT_SAVE_MD]: string

  [IPC.PROFILE_GET]: UserProfile | null
  [IPC.PROFILE_SAVE]: void
  [IPC.HR_ZONES_GET]: HrZone[]
  [IPC.HR_ZONES_SAVE]: void

  [IPC.DATA_EXPORT]: string
  [IPC.DATA_IMPORT]: void

  [IPC.AUTOSTART_GET]: boolean
  [IPC.AUTOSTART_SET]: boolean

  [IPC.CHECKIN_GET]: DailyCheckin | null
  [IPC.CHECKIN_UPSERT]: DailyCheckin

  [IPC.RECOVERY_LOG_UPSERT]: RecoveryLog
  [IPC.RECOVERY_LOGS_GET]: RecoveryLog[]
  [IPC.RECOVERY_LOG_DELETE]: void
}

/** What the renderer sends. */
export type InputOf<C extends IpcChannel> = z.input<(typeof ipcInputs)[C]>
/** What the handler receives after validation. */
export type ParsedOf<C extends IpcChannel> = z.output<(typeof ipcInputs)[C]>
export type ResultOf<C extends IpcChannel> = IpcResults[C]
