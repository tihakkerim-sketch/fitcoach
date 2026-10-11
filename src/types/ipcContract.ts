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
import { isMonday } from '../shared/planCalendar'
import type {
  IpcChannel,
  ActivityRow, PlanRow, PlanDetail, PlanTodayResult, SessionRow, AdaptPlanResult, UserProfile, HrZone,
  StatsResult, DailyCheckin, RecoveryLog, ActivitySplit, ActivityStreams, ImportFileResult,
  IntervalsStatus, SyncResult,
} from './ipc'
import type { CoachStatus } from '../shared/coach/types'

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
export const activitySourceSchema = z.enum(['manual', 'garmin_import', 'intervals_icu'])

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
  elevationGainM: z.number().min(0).max(100000).optional(),
  elevationLossM: z.number().min(0).max(100000).optional(),
  movingTimeMin: duration.optional(),
  externalId: z.string().min(1).max(100).optional(),
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

const garminFileName = z.string().min(1).max(260).refine(
  n => /\.(fit|tcx)$/i.test(n),
  'Nur .fit- und .tcx-Dateien werden unterstützt',
)

export const garminImportFilesSchema = z.object({
  files: z.array(z.object({
    fileName: garminFileName,
    /** Raw file bytes (structured clone transfers Uint8Array directly) */
    data: z.instanceof(Uint8Array).refine(
      b => b.byteLength <= MAX_GARMIN_FILE_BYTES,
      'Datei ist zu groß (max. 50 MB)',
    ),
  })).min(1).max(50),
})
export type GarminImportFilesPayload = z.infer<typeof garminImportFilesSchema>

// ── intervals.icu ─────────────────────────────────────────────────────────────

export const intervalsSetKeySchema = z.object({
  apiKey: z.string().trim().min(10).max(200),
})
export type IntervalsSetKeyPayload = z.infer<typeof intervalsSetKeySchema>

// ── Plans ─────────────────────────────────────────────────────────────────────

export const sessionTypeSchema = z.enum(['running', 'cycling', 'strength', 'rest', 'custom'])
export const sessionStatusSchema = z.enum(['planned', 'completed', 'skipped'])

export type SessionType = z.infer<typeof sessionTypeSchema>
export type SessionStatus = z.infer<typeof sessionStatusSchema>

const paceSec = z.number().int().min(120).max(1200) // Sekunden pro km (2:00–20:00)

/** Ein Intervall-Schritt (Aufwärmen, Belastung, Trabpause, Auslaufen). */
export const planStepSchema = z.object({
  kind: z.enum(['warmup', 'work', 'recovery', 'cooldown']),
  distanceM: z.number().min(1).max(100000).nullish(),
  durationSec: z.number().int().min(1).max(86400).nullish(),
  paceFastSec: paceSec.nullish(),
  paceSlowSec: paceSec.nullish(),
  hrZone: z.number().int().min(1).max(5).nullish(),
  note: shortText.nullish(),
})
export type PlanStep = z.infer<typeof planStepSchema>

/** Schritt oder Wiederholung von Schritten (eine Verschachtelungsebene). */
export const planBlockSchema = z.union([
  planStepSchema,
  z.object({
    repeat: z.number().int().min(2).max(50),
    steps: z.array(planStepSchema).min(1).max(10),
  }),
])
export type PlanBlock = z.infer<typeof planBlockSchema>

export const planStepsSchema = z.array(planBlockSchema).max(30)

/** Startdatum eines Plans: gültiges Datum und immer ein Montag. */
const mondayDate = dateString.refine(isMonday, 'Startdatum muss ein Montag sein')

const sessionBaseSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7), // 1 = Mo … 7 = So
  type: sessionTypeSchema,
  title: z.string().max(100).nullish(),
  targetDistanceKm: z.number().min(0).max(500).nullish(),
  targetDurationMin: z.number().min(0).max(1440).nullish(),
  targetPaceFastSec: paceSec.nullish(),
  targetPaceSlowSec: paceSec.nullish(),
  targetHrZone: z.number().int().min(1).max(5).nullish(),
  steps: planStepsSchema.nullish(),
  coachingNote: longText.nullish(),
})

const paceOrderOk = (s: { targetPaceFastSec?: number | null; targetPaceSlowSec?: number | null }) =>
  s.targetPaceFastSec == null || s.targetPaceSlowSec == null || s.targetPaceFastSec <= s.targetPaceSlowSec
const PACE_ORDER_MESSAGE = 'Pace: schneller Wert muss kleiner sein'

export const sessionFieldsSchema = sessionBaseSchema.refine(paceOrderOk, PACE_ORDER_MESSAGE)

export const planWeekInputSchema = z.object({
  phase: shortText.nullish(),
  notes: longText.nullish(),
  sessions: z.array(sessionFieldsSchema).max(21),
})

export const createPlanSchema = z.object({
  name: shortText.min(1),
  goalEvent: shortText.nullish(),
  goalDate: dateString.nullish(),
  startDate: mondayDate,
  weeks: z.array(planWeekInputSchema).min(1).max(52),
})
export type CreatePlanPayload = z.infer<typeof createPlanSchema>

export const createEmptyPlanSchema = z.object({
  name: shortText.min(1),
  goalEvent: shortText.nullish(),
  goalDate: dateString.nullish(),
  startDate: mondayDate,
  weekCount: z.number().int().min(1).max(52),
})
export type CreateEmptyPlanPayload = z.infer<typeof createEmptyPlanSchema>

export const updatePlanSchema = z.object({
  planId: id,
  name: shortText.min(1).optional(),
  goalEvent: shortText.nullish(),
  goalDate: dateString.nullish(),
  startDate: mondayDate.optional(),
  weekCount: z.number().int().min(1).max(52).optional(),
})
export type UpdatePlanPayload = z.infer<typeof updatePlanSchema>

export const adaptPlanSchema = createPlanSchema.extend({ planId: id })
export type AdaptPlanPayload = z.infer<typeof adaptPlanSchema>

export const updateWeekSchema = z.object({
  weekId: id,
  phase: shortText.nullish(),
  notes: longText.nullish(),
})
export type UpdateWeekPayload = z.infer<typeof updateWeekSchema>

export const createSessionSchema = sessionBaseSchema
  .extend({ planId: id, weekIndex: z.number().int().min(0).max(51) })
  .refine(paceOrderOk, PACE_ORDER_MESSAGE)
export type CreateSessionPayload = z.infer<typeof createSessionSchema>

export const updateSessionSchema = sessionBaseSchema
  .partial()
  .extend({ sessionId: id, weekIndex: z.number().int().min(0).max(51).optional() })
  .refine(paceOrderOk, PACE_ORDER_MESSAGE)
export type UpdateSessionPayload = z.infer<typeof updateSessionSchema>

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

// ── Coach ─────────────────────────────────────────────────────────────────────

/** Einheiten-Felder ohne Wochentag (Datum kommt aus der Änderung). */
const coachSessionFields = sessionBaseSchema.omit({ dayOfWeek: true })

/** Eine Änderung aus der Claude-Antwort (bereits in App-Felder übersetzt). */
export const coachChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update'), sessionId: id, set: coachSessionFields.partial() }),
  z.object({ action: z.literal('move'), sessionId: id, date: dateString }),
  z.object({ action: z.literal('remove'), sessionId: id }),
  z.object({ action: z.literal('add'), date: dateString, session: coachSessionFields }),
])
export type CoachChange = z.infer<typeof coachChangeSchema>

export const coachApplySchema = z.object({
  planId: id,
  changes: z.array(coachChangeSchema).min(1).max(100),
})
export type CoachApplyPayload = z.infer<typeof coachApplySchema>

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

export const recoverySourceSchema = z.enum(['manual', 'garmin_import', 'intervals_icu'])

export type RecoverySource = z.infer<typeof recoverySourceSchema>

// readinessScore is intentionally not accepted — always auto-calculated from the other metrics
export const upsertRecoveryLogSchema = z.object({
  date: dateString,
  hrvRmssd: z.number().min(0).max(500).optional(),
  bodyBattery: z.number().min(0).max(100).optional(),
  sleepScore: z.number().min(0).max(100).optional(),
  restingHr: z.number().min(20).max(250).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
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
  [IPC.ACTIVITIES_DETAILS]: id,

  [IPC.GARMIN_IMPORT_FILES]: garminImportFilesSchema,

  [IPC.INTERVALS_STATUS]: z.undefined(),
  [IPC.INTERVALS_SET_KEY]: intervalsSetKeySchema,
  [IPC.INTERVALS_CLEAR_KEY]: z.undefined(),
  [IPC.INTERVALS_SYNC]: z.undefined(),

  [IPC.PLANS_CREATE]: createPlanSchema,
  [IPC.PLANS_CREATE_EMPTY]: createEmptyPlanSchema,
  [IPC.PLANS_UPDATE]: updatePlanSchema,
  [IPC.PLANS_LIST]: z.undefined(),
  [IPC.PLANS_GET]: id,
  [IPC.PLANS_TODAY]: z.undefined(),
  [IPC.PLANS_DELETE]: id,
  [IPC.PLANS_ACTIVATE]: id,
  [IPC.PLAN_WEEK_UPDATE]: updateWeekSchema,
  [IPC.SESSIONS_CREATE]: createSessionSchema,
  [IPC.SESSIONS_UPDATE]: updateSessionSchema,
  [IPC.SESSIONS_DELETE]: id,
  [IPC.SESSIONS_UPDATE_STATUS]: updateSessionStatusSchema,
  [IPC.SESSIONS_LINK_ACTIVITY]: linkSessionActivitySchema,
  [IPC.PLANS_ADAPT]: adaptPlanSchema,

  [IPC.STATS_GET]: z.undefined(),

  [IPC.COACH_STATUS]: z.undefined(),
  [IPC.COACH_APPLY_CHANGES]: coachApplySchema,

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
  [IPC.ACTIVITIES_DETAILS]: { splits: ActivitySplit[]; streams: ActivityStreams | null }

  [IPC.GARMIN_IMPORT_FILES]: ImportFileResult[]

  [IPC.INTERVALS_STATUS]: IntervalsStatus
  [IPC.INTERVALS_SET_KEY]: { athleteName?: string }
  [IPC.INTERVALS_CLEAR_KEY]: void
  [IPC.INTERVALS_SYNC]: SyncResult

  [IPC.PLANS_CREATE]: PlanRow
  [IPC.PLANS_CREATE_EMPTY]: PlanRow
  [IPC.PLANS_UPDATE]: PlanRow
  [IPC.PLANS_LIST]: PlanRow[]
  [IPC.PLANS_GET]: PlanDetail | null
  [IPC.PLANS_TODAY]: PlanTodayResult
  [IPC.PLANS_DELETE]: void
  [IPC.PLANS_ACTIVATE]: void
  [IPC.PLAN_WEEK_UPDATE]: void
  [IPC.SESSIONS_CREATE]: SessionRow
  [IPC.SESSIONS_UPDATE]: SessionRow
  [IPC.SESSIONS_DELETE]: void
  [IPC.SESSIONS_UPDATE_STATUS]: void
  [IPC.SESSIONS_LINK_ACTIVITY]: void
  [IPC.PLANS_ADAPT]: AdaptPlanResult

  [IPC.STATS_GET]: StatsResult

  [IPC.COACH_STATUS]: CoachStatus
  [IPC.COACH_APPLY_CHANGES]: { applied: number }

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
