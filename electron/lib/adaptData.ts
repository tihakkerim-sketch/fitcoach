/**
 * DB → Eingaben der Plan-Auto-Anpassung (`src/shared/adapt`). Ohne `electron`-Import.
 */
import { asc, eq } from 'drizzle-orm'
import { activities, activitySplits } from '../../db/schema'
import { addDaysStr, planEndDate } from '../../src/shared/planCalendar'
import type { AdaptInput, AdaptSession, RunFeedback } from '../../src/shared/adapt'
import { isHard } from '../../src/shared/adapt'
import type { ZoneDef } from '../../src/shared/coach'
import type { SessionRow } from '../../src/types/ipc'
import { getActivePlanDetail, getCoachStatus } from './coachData'
import type { TxDb } from './transaction'

type ActivityRow = typeof activities.$inferSelect

export function toAdaptSession(s: SessionRow): AdaptSession {
  return {
    id: s.id, date: s.date, type: s.type, title: s.title,
    targetDistanceKm: s.targetDistanceKm, targetDurationMin: s.targetDurationMin,
    targetPaceFastSec: s.targetPaceFastSec, targetPaceSlowSec: s.targetPaceSlowSec,
    targetHrZone: s.targetHrZone, hasSteps: !!s.steps && s.steps.length > 0, status: s.status,
  }
}

/** Ø-Tempo in s/km; bei Intervall-Einheiten Median der schnelleren Hälfte der km-Splits. */
function paceOf(db: TxDb, a: ActivityRow, intervals: boolean): number | null {
  if (intervals) {
    const paces = db.select({ p: activitySplits.paceSecPerKm }).from(activitySplits)
      .where(eq(activitySplits.activityId, a.id)).orderBy(asc(activitySplits.splitIndex)).all()
      .map(r => r.p).filter((p): p is number => typeof p === 'number' && p > 0).sort((x, y) => x - y)
    if (paces.length >= 2) {
      const fast = paces.slice(0, Math.ceil(paces.length / 2))
      return Math.round(fast[Math.floor((fast.length - 1) / 2)])
    }
  }
  const min = a.movingTimeMin ?? a.durationMin
  if (!a.distanceKm || a.distanceKm <= 0 || !min || min <= 0) return null
  return Math.round((min * 60) / a.distanceKm)
}

function toFeedback(db: TxDb, s: SessionRow, a: ActivityRow, zones: ZoneDef[]): RunFeedback {
  const zone = s.targetHrZone != null ? zones.find(z => z.zoneNumber === s.targetHrZone) : undefined
  const session = toAdaptSession(s)
  return {
    activityId: a.id, date: a.date, sessionId: s.id, sessionHard: isHard(session),
    effort: a.perceivedEffort, pain: a.pain === 1, avgHr: a.avgHr,
    zoneMinHr: zone?.minHr ?? null, zoneMaxHr: zone?.maxHr ?? null,
    paceSec: paceOf(db, a, session.hasSteps), targetPaceFastSec: s.targetPaceFastSec, distanceKm: a.distanceKm,
  }
}

/** Aktiver Plan + Eingaben; null ohne aktiven Plan. */
export function loadAdaptInput(db: TxDb, today: string): { planId: number; input: AdaptInput } | null {
  const plan = getActivePlanDetail(db)
  if (!plan) return null
  const status = getCoachStatus(db, today)
  const all = plan.weeks.flatMap(w => w.sessions)

  const from = addDaysStr(today, -7)
  const to = addDaysStr(today, 13)
  const sessions = all.filter(s => s.date >= from && s.date <= to).map(toAdaptSession)

  const recentFrom = addDaysStr(today, -27)
  const linked = all
    .filter(s => s.linkedActivityId !== null && s.activity && s.activity.date >= recentFrom && s.activity.date <= today)
  const recent: RunFeedback[] = []
  for (const s of linked) {
    const a = db.select().from(activities).where(eq(activities.id, s.linkedActivityId!)).get()
    if (a && a.type === 'running') recent.push(toFeedback(db, s, a, status.zones))
  }
  recent.sort((x, y) => x.date.localeCompare(y.date) || x.activityId - y.activityId)

  const recoveryBad = (status.recovery.hrvDeltaPct ?? 0) <= -10
    || status.form === 'overload'
    || status.ramp.warnings.some(w => w.kind === 'acwr')

  return {
    planId: plan.id,
    input: {
      today, planEnd: planEndDate(plan.startDate, plan.weekCount), sessions, recent, recoveryBad,
      avgWeekKmPrev28: status.ramp.avgWeekKmPrev28,
    },
  }
}
