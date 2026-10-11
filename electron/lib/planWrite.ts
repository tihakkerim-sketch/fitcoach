/**
 * Plan anlegen/ändern/anpassen, Einheiten bearbeiten, Status und Verknüpfung setzen.
 * Alles Mehrschrittige läuft in einer Transaktion (ganz oder gar nicht).
 * Ohne `electron`-Import (testbar mit In-Memory-DB).
 */
import { and, asc, eq, gte, inArray, ne } from 'drizzle-orm'
import { activities, planSessions, planWeeks, trainingPlans } from '../../db/schema'
import type {
  AdaptPlanPayload, AdaptPlanResult, CreateEmptyPlanPayload, CreatePlanPayload, CreateSessionPayload,
  LinkSessionActivityPayload, PlanRow, SessionRow, UpdatePlanPayload, UpdateSessionPayload,
  UpdateSessionStatusPayload, UpdateWeekPayload,
} from '../../src/types/ipc'
import { rematchPlan } from './matchSessions'
import { getPlanRow, getSessionRow } from './planRead'
import { runInTransaction, type TxDb } from './transaction'

type SessionFields = CreatePlanPayload['weeks'][number]['sessions'][number]

const stepsJson = (steps: SessionFields['steps']): string | null =>
  steps && steps.length > 0 ? JSON.stringify(steps) : null

function sessionValues(weekId: number, s: SessionFields) {
  return {
    weekId,
    dayOfWeek: s.dayOfWeek,
    type: s.type,
    title: s.title ?? null,
    targetDistanceKm: s.targetDistanceKm ?? null,
    targetDurationMin: s.targetDurationMin ?? null,
    targetPaceFastSec: s.targetPaceFastSec ?? null,
    targetPaceSlowSec: s.targetPaceSlowSec ?? null,
    targetHrZone: s.targetHrZone ?? null,
    steps: stepsJson(s.steps),
    coachingNote: s.coachingNote ?? null,
    status: 'planned',
  }
}

/** Fügt Wochen (mit Einheiten) in einen Plan ein; gibt die neuen Session-IDs je Slot zurück. */
function insertWeeks(
  db: TxDb, planId: number, weeks: CreatePlanPayload['weeks'],
): Map<string, number[]> {
  const slots = new Map<string, number[]>()
  weeks.forEach((week, weekIndex) => {
    const [w] = db.insert(planWeeks)
      .values({ planId, weekIndex, phase: week.phase ?? null, notes: week.notes ?? null })
      .returning().all()
    for (const s of week.sessions) {
      const [row] = db.insert(planSessions).values(sessionValues(w.id, s)).returning().all()
      const key = `${weekIndex}:${s.dayOfWeek}:${s.type}`
      slots.set(key, [...(slots.get(key) ?? []), row.id])
    }
  })
  return slots
}

function deactivateOthers(db: TxDb, planId: number): void {
  db.update(trainingPlans).set({ isActive: 0 }).where(ne(trainingPlans.id, planId)).run()
}

function requirePlanRow(db: TxDb, planId: number): PlanRow {
  const row = getPlanRow(db, planId)
  if (!row) throw new Error('Plan nicht gefunden.')
  return row
}

export function createPlan(db: TxDb, p: CreatePlanPayload, now: number = Date.now()): PlanRow {
  return runInTransaction(db, () => {
    const [plan] = db.insert(trainingPlans).values({
      name: p.name, goalEvent: p.goalEvent ?? null, goalDate: p.goalDate ?? null,
      startDate: p.startDate, isActive: 1, createdAt: now,
    }).returning().all()
    deactivateOthers(db, plan.id)
    insertWeeks(db, plan.id, p.weeks)
    rematchPlan(db, plan.id, now)
    return requirePlanRow(db, plan.id)
  })
}

export function createEmptyPlan(db: TxDb, p: CreateEmptyPlanPayload, now: number = Date.now()): PlanRow {
  return runInTransaction(db, () => {
    const [plan] = db.insert(trainingPlans).values({
      name: p.name, goalEvent: p.goalEvent ?? null, goalDate: p.goalDate ?? null,
      startDate: p.startDate, isActive: 1, createdAt: now,
    }).returning().all()
    deactivateOthers(db, plan.id)
    insertWeeks(db, plan.id, Array.from({ length: p.weekCount }, () => ({ sessions: [] })))
    rematchPlan(db, plan.id, now)
    return requirePlanRow(db, plan.id)
  })
}

export function updatePlan(db: TxDb, p: UpdatePlanPayload): PlanRow {
  return runInTransaction(db, () => {
    const current = requirePlanRow(db, p.planId)

    if (p.weekCount !== undefined && p.weekCount < current.weekCount) {
      const dropped = db.select().from(planWeeks)
        .where(and(eq(planWeeks.planId, p.planId), gte(planWeeks.weekIndex, p.weekCount)))
        .orderBy(asc(planWeeks.weekIndex)).all()
      for (const w of dropped) {
        const has = db.select({ id: planSessions.id }).from(planSessions).where(eq(planSessions.weekId, w.id)).get()
        if (has) throw new Error(`Woche ${w.weekIndex + 1} enthält noch Einheiten – zuerst löschen oder verschieben.`)
      }
      for (const w of dropped) db.delete(planWeeks).where(eq(planWeeks.id, w.id)).run()
    } else if (p.weekCount !== undefined && p.weekCount > current.weekCount) {
      for (let i = current.weekCount; i < p.weekCount; i++) {
        db.insert(planWeeks).values({ planId: p.planId, weekIndex: i }).run()
      }
    }

    const set: Partial<typeof trainingPlans.$inferInsert> = {}
    if (p.name !== undefined) set.name = p.name
    if (p.goalEvent !== undefined) set.goalEvent = p.goalEvent
    if (p.goalDate !== undefined) set.goalDate = p.goalDate
    if (p.startDate !== undefined) set.startDate = p.startDate
    if (Object.keys(set).length > 0) {
      db.update(trainingPlans).set(set).where(eq(trainingPlans.id, p.planId)).run()
    }

    if (p.startDate !== undefined && p.startDate !== current.startDate) rematchPlan(db, p.planId)
    return requirePlanRow(db, p.planId)
  })
}

export function activatePlan(db: TxDb, planId: number): void {
  runInTransaction(db, () => {
    requirePlanRow(db, planId)
    deactivateOthers(db, planId)
    db.update(trainingPlans).set({ isActive: 1 }).where(eq(trainingPlans.id, planId)).run()
    rematchPlan(db, planId)
  })
}

/**
 * Ersetzt die geplante Struktur eines Plans, behält aber erledigte/übersprungene Einheiten:
 * sie werden auf die erste freie neue Einheit mit gleicher Position (Woche, Tag, Typ) zurückgeschrieben.
 */
export function adaptPlan(db: TxDb, p: AdaptPlanPayload): AdaptPlanResult {
  return runInTransaction(db, () => {
    requirePlanRow(db, p.planId)

    // 1. Erledigte / übersprungene Einheiten sichern
    const oldWeeks = db.select().from(planWeeks).where(eq(planWeeks.planId, p.planId)).all()
    const weekIndexById = new Map(oldWeeks.map(w => [w.id, w.weekIndex]))
    const saved = oldWeeks.length === 0 ? [] : db.select().from(planSessions)
      .where(and(inArray(planSessions.weekId, oldWeeks.map(w => w.id)), ne(planSessions.status, 'planned')))
      .orderBy(asc(planSessions.id)).all()
      .map(s => ({ ...s, weekIndex: weekIndexById.get(s.weekId) as number }))

    // 2. Alte Wochen löschen (Einheiten fallen per CASCADE mit), neue einfügen
    db.delete(planWeeks).where(eq(planWeeks.planId, p.planId)).run()
    db.update(trainingPlans).set({
      name: p.name, goalEvent: p.goalEvent ?? null, goalDate: p.goalDate ?? null, startDate: p.startDate,
    }).where(eq(trainingPlans.id, p.planId)).run()
    const slots = insertWeeks(db, p.planId, p.weeks)

    // 3. Gesicherte Einheiten auf die erste freie Einheit am gleichen Slot zurückschreiben
    let restored = 0
    for (const s of saved) {
      const ids = slots.get(`${s.weekIndex}:${s.dayOfWeek}:${s.type}`)
      const target = ids?.shift()
      if (target === undefined) continue
      db.update(planSessions).set({
        status: s.status, linkedActivityId: s.linkedActivityId, matchSource: s.matchSource,
        completedAt: s.completedAt, completionNote: s.completionNote,
      }).where(eq(planSessions.id, target)).run()
      restored++
    }

    rematchPlan(db, p.planId)
    return { preserved: saved.length, restored }
  })
}

export function updateWeek(db: TxDb, p: UpdateWeekPayload): void {
  const set: Partial<typeof planWeeks.$inferInsert> = {}
  if (p.phase !== undefined) set.phase = p.phase
  if (p.notes !== undefined) set.notes = p.notes
  if (Object.keys(set).length === 0) return
  db.update(planWeeks).set(set).where(eq(planWeeks.id, p.weekId)).run()
}

function weekIdOf(db: TxDb, planId: number, weekIndex: number): number {
  const week = db.select({ id: planWeeks.id }).from(planWeeks)
    .where(and(eq(planWeeks.planId, planId), eq(planWeeks.weekIndex, weekIndex))).get()
  if (!week) throw new Error(`Woche ${weekIndex + 1} gibt es in diesem Plan nicht.`)
  return week.id
}

export function createSession(db: TxDb, p: CreateSessionPayload): SessionRow {
  return runInTransaction(db, () => {
    requirePlanRow(db, p.planId)
    const weekId = weekIdOf(db, p.planId, p.weekIndex)
    const [row] = db.insert(planSessions).values(sessionValues(weekId, p)).returning().all()
    rematchPlan(db, p.planId)
    return getSessionRow(db, row.id) as SessionRow
  })
}

export function updateSession(db: TxDb, p: UpdateSessionPayload): SessionRow {
  return runInTransaction(db, () => {
    const existing = db.select().from(planSessions).where(eq(planSessions.id, p.sessionId)).get()
    if (!existing) throw new Error('Einheit nicht gefunden.')
    const oldWeek = db.select().from(planWeeks).where(eq(planWeeks.id, existing.weekId)).get()
    if (!oldWeek) throw new Error('Einheit nicht gefunden.')

    const set: Partial<typeof planSessions.$inferInsert> = {}
    if (p.weekIndex !== undefined) set.weekId = weekIdOf(db, oldWeek.planId, p.weekIndex)
    if (p.dayOfWeek !== undefined) set.dayOfWeek = p.dayOfWeek
    if (p.type !== undefined) set.type = p.type
    if (p.title !== undefined) set.title = p.title
    if (p.targetDistanceKm !== undefined) set.targetDistanceKm = p.targetDistanceKm
    if (p.targetDurationMin !== undefined) set.targetDurationMin = p.targetDurationMin
    if (p.targetPaceFastSec !== undefined) set.targetPaceFastSec = p.targetPaceFastSec
    if (p.targetPaceSlowSec !== undefined) set.targetPaceSlowSec = p.targetPaceSlowSec
    if (p.targetHrZone !== undefined) set.targetHrZone = p.targetHrZone
    if (p.steps !== undefined) set.steps = stepsJson(p.steps)
    if (p.coachingNote !== undefined) set.coachingNote = p.coachingNote

    const fast = set.targetPaceFastSec !== undefined ? set.targetPaceFastSec : existing.targetPaceFastSec
    const slow = set.targetPaceSlowSec !== undefined ? set.targetPaceSlowSec : existing.targetPaceSlowSec
    if (fast != null && slow != null && fast > slow) throw new Error('Pace: schneller Wert muss kleiner sein')

    // Verschoben oder anderer Typ: eine automatische Zuordnung passt dann nicht mehr
    const moved = (set.weekId !== undefined && set.weekId !== existing.weekId)
      || (set.dayOfWeek !== undefined && set.dayOfWeek !== existing.dayOfWeek)
      || (set.type !== undefined && set.type !== existing.type)
    if (moved && existing.matchSource === 'auto') {
      Object.assign(set, { status: 'planned', linkedActivityId: null, matchSource: null, completedAt: null })
    }

    if (Object.keys(set).length > 0) {
      db.update(planSessions).set(set).where(eq(planSessions.id, p.sessionId)).run()
    }
    if (moved) rematchPlan(db, oldWeek.planId)
    return getSessionRow(db, p.sessionId) as SessionRow
  })
}

export function deleteSession(db: TxDb, sessionId: number): void {
  db.delete(planSessions).where(eq(planSessions.id, sessionId)).run()
}

export function setSessionStatus(db: TxDb, p: UpdateSessionStatusPayload, now: number = Date.now()): void {
  const note = p.completionNote ?? null
  if (p.status === 'completed') {
    db.update(planSessions)
      .set({ status: 'completed', completedAt: p.completedAt ?? now, completionNote: note })
      .where(eq(planSessions.id, p.sessionId)).run()
  } else {
    db.update(planSessions)
      .set({ status: p.status, linkedActivityId: null, matchSource: null, completedAt: null, completionNote: note })
      .where(eq(planSessions.id, p.sessionId)).run()
  }
}

/** Manuell verknüpfen (activityId) oder lösen (null → wieder geplant). */
export function linkSessionActivity(db: TxDb, p: LinkSessionActivityPayload, now: number = Date.now()): void {
  runInTransaction(db, () => {
    if (p.activityId === null) {
      db.update(planSessions)
        .set({ status: 'planned', linkedActivityId: null, matchSource: null, completedAt: null })
        .where(eq(planSessions.id, p.sessionId)).run()
      return
    }
    const activity = db.select({ id: activities.id }).from(activities).where(eq(activities.id, p.activityId)).get()
    if (!activity) throw new Error('Aktivität nicht gefunden.')

    // Hängt der Lauf schon an einer anderen Einheit, wird diese wieder geplant
    db.update(planSessions)
      .set({ status: 'planned', linkedActivityId: null, matchSource: null, completedAt: null })
      .where(and(eq(planSessions.linkedActivityId, p.activityId), ne(planSessions.id, p.sessionId))).run()
    db.update(planSessions)
      .set({ status: 'completed', linkedActivityId: p.activityId, matchSource: 'manual', completedAt: now })
      .where(eq(planSessions.id, p.sessionId)).run()
  })
}
