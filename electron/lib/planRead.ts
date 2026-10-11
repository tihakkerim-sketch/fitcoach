/**
 * Plan lesen: Liste, Detail (Wochen + Einheiten mit berechnetem Datum und verknüpftem Lauf),
 * „Heute"-Sicht für das Dashboard. Ohne `electron`-Import (testbar mit In-Memory-DB).
 */
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { activities, planSessions, planWeeks, trainingPlans } from '../../db/schema'
import type {
  PlanBlock, PlanDetail, PlanRow, PlanTodayResult, SessionRow, SessionStatus, SessionType, WeekDetail,
  LinkedActivitySummary, MatchSource,
} from '../../src/types/ipc'
import { currentWeekIndex, planState, sessionDate, weekRange } from '../../src/shared/planCalendar'
import type { TxDb } from './transaction'

type PlanDbRow = typeof trainingPlans.$inferSelect
type SessionDbRow = typeof planSessions.$inferSelect
type ActivityDbRow = typeof activities.$inferSelect

/** steps ist JSON-Text; kaputtes JSON ergibt null statt einen Fehler. */
function parseSteps(text: string | null): PlanBlock[] | null {
  if (!text) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) ? (parsed as PlanBlock[]) : null
  } catch {
    return null
  }
}

function toPlanRow(plan: PlanDbRow, weekCount: number): PlanRow {
  return {
    id: plan.id, name: plan.name, goalEvent: plan.goalEvent, goalDate: plan.goalDate,
    startDate: plan.startDate, isActive: plan.isActive, createdAt: plan.createdAt, weekCount,
  }
}

function toSessionRow(
  s: SessionDbRow, week: { weekIndex: number }, startDate: string, activity: ActivityDbRow | null,
): SessionRow {
  const linked: LinkedActivitySummary | null = activity
    ? {
        id: activity.id, date: activity.date, type: activity.type,
        distanceKm: activity.distanceKm, durationMin: activity.durationMin, avgHr: activity.avgHr,
      }
    : null
  return {
    id: s.id, weekId: s.weekId, weekIndex: week.weekIndex, dayOfWeek: s.dayOfWeek,
    date: sessionDate(startDate, week.weekIndex, s.dayOfWeek),
    type: s.type as SessionType, title: s.title,
    targetDistanceKm: s.targetDistanceKm, targetDurationMin: s.targetDurationMin,
    targetPaceFastSec: s.targetPaceFastSec, targetPaceSlowSec: s.targetPaceSlowSec,
    targetHrZone: s.targetHrZone, steps: parseSteps(s.steps), coachingNote: s.coachingNote,
    status: s.status as SessionStatus, linkedActivityId: s.linkedActivityId,
    matchSource: s.matchSource as MatchSource | null,
    completedAt: s.completedAt, completionNote: s.completionNote, activity: linked,
  }
}

export function getPlanRow(db: TxDb, planId: number): PlanRow | null {
  const plan = db.select().from(trainingPlans).where(eq(trainingPlans.id, planId)).get()
  if (!plan) return null
  const weeks = db.select({ id: planWeeks.id }).from(planWeeks).where(eq(planWeeks.planId, planId)).all()
  return toPlanRow(plan, weeks.length)
}

/** Alle Pläne, neueste zuerst. */
export function listPlans(db: TxDb): PlanRow[] {
  const plans = db.select().from(trainingPlans).orderBy(desc(trainingPlans.createdAt), desc(trainingPlans.id)).all()
  const counts = new Map<number, number>()
  for (const w of db.select({ planId: planWeeks.planId }).from(planWeeks).all()) {
    counts.set(w.planId, (counts.get(w.planId) ?? 0) + 1)
  }
  return plans.map(p => toPlanRow(p, counts.get(p.id) ?? 0))
}

export function getPlanDetail(db: TxDb, planId: number): PlanDetail | null {
  const plan = db.select().from(trainingPlans).where(eq(trainingPlans.id, planId)).get()
  if (!plan) return null

  const weeks = db.select().from(planWeeks).where(eq(planWeeks.planId, planId)).orderBy(asc(planWeeks.weekIndex)).all()
  const weekIds = weeks.map(w => w.id)
  const sessionRows = weekIds.length
    ? db.select().from(planSessions).where(inArray(planSessions.weekId, weekIds))
        .orderBy(asc(planSessions.dayOfWeek), asc(planSessions.id)).all()
    : []

  const activityIds = [...new Set(sessionRows.map(s => s.linkedActivityId).filter((x): x is number => x !== null))]
  const activityMap = new Map<number, ActivityDbRow>()
  if (activityIds.length) {
    for (const a of db.select().from(activities).where(inArray(activities.id, activityIds)).all()) activityMap.set(a.id, a)
  }

  const details: WeekDetail[] = weeks.map(w => ({
    id: w.id, planId: w.planId, weekIndex: w.weekIndex, phase: w.phase, notes: w.notes,
    ...weekRange(plan.startDate, w.weekIndex),
    sessions: sessionRows
      .filter(s => s.weekId === w.id)
      .map(s => toSessionRow(s, w, plan.startDate, s.linkedActivityId !== null ? activityMap.get(s.linkedActivityId) ?? null : null)),
  }))

  return { ...toPlanRow(plan, weeks.length), weeks: details }
}

/** Eine einzelne Einheit (z. B. als Ergebnis von sessions:create / sessions:update). */
export function getSessionRow(db: TxDb, sessionId: number): SessionRow | null {
  const s = db.select().from(planSessions).where(eq(planSessions.id, sessionId)).get()
  if (!s) return null
  const week = db.select().from(planWeeks).where(eq(planWeeks.id, s.weekId)).get()
  if (!week) return null
  const plan = db.select().from(trainingPlans).where(eq(trainingPlans.id, week.planId)).get()
  if (!plan) return null
  const activity = s.linkedActivityId !== null
    ? db.select().from(activities).where(eq(activities.id, s.linkedActivityId)).get() ?? null
    : null
  return toSessionRow(s, week, plan.startDate, activity)
}

/** Dashboard: aktiver Plan, Zustand relativ zu `today`, heutige Einheiten + Einheiten der laufenden Woche. */
export function getPlanToday(db: TxDb, today: string): PlanTodayResult {
  const active = db.select({ id: trainingPlans.id }).from(trainingPlans)
    .where(eq(trainingPlans.isActive, 1)).orderBy(desc(trainingPlans.id)).get()
  const detail = active ? getPlanDetail(db, active.id) : null
  if (!detail) {
    return { plan: null, state: 'none', today, weekIndex: null, todaySessions: [], weekSessions: [] }
  }

  const { weeks, ...plan } = detail
  const state = planState(plan.startDate, plan.weekCount, today)
  if (state !== 'running') {
    return { plan, state, today, weekIndex: null, todaySessions: [], weekSessions: [] }
  }

  const weekIndex = currentWeekIndex(plan.startDate, today)
  const weekSessions = weeks.find(w => w.weekIndex === weekIndex)?.sessions ?? []
  return { plan, state, today, weekIndex, todaySessions: weekSessions.filter(s => s.date === today), weekSessions }
}
