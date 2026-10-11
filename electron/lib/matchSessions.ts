/**
 * Automatische Zuordnung Lauf ↔ Plan-Einheit (siehe Spec „Automatische Zuordnung").
 * Nur aktiver Plan, gleicher Typ, gleiches (lokales) Datum, höchstens eine Einheit pro Aktivität.
 * Alle Funktionen laufen in `runInTransaction` (verschachtelt = Savepoint). Ohne `electron`-Import.
 */
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm'
import { activities, planSessions, planWeeks, trainingPlans } from '../../db/schema'
import { currentWeekIndex, planEndDate, sessionDate } from '../../src/shared/planCalendar'
import { runInTransaction, type TxDb } from './transaction'

const MATCHABLE_TYPES = ['running', 'cycling', 'strength']

/** Wochenindex + Wochentag (1–7) von `date` im Plan; null, wenn vor dem Start. */
function slotOf(startDate: string, date: string): { weekIndex: number; dayOfWeek: number } | null {
  const weekIndex = currentWeekIndex(startDate, date)
  if (weekIndex < 0) return null
  for (let dow = 1; dow <= 7; dow++) {
    if (sessionDate(startDate, weekIndex, dow) === date) return { weekIndex, dayOfWeek: dow }
  }
  return null
}

/** Ordnet eine Aktivität der passenden Einheit zu. Gibt die Session-ID zurück oder null. */
export function matchActivity(db: TxDb, activityId: number, now: number = Date.now()): number | null {
  return runInTransaction(db, () => {
    const act = db.select().from(activities).where(eq(activities.id, activityId)).get()
    if (!act || !MATCHABLE_TYPES.includes(act.type)) return null

    const alreadyLinked = db.select({ id: planSessions.id }).from(planSessions)
      .where(eq(planSessions.linkedActivityId, activityId)).get()
    if (alreadyLinked) return null

    const plans = db.select().from(trainingPlans).where(eq(trainingPlans.isActive, 1)).all()
    for (const plan of plans) {
      const slot = slotOf(plan.startDate, act.date)
      if (!slot) continue
      const candidate = db
        .select({ id: planSessions.id })
        .from(planSessions)
        .innerJoin(planWeeks, eq(planSessions.weekId, planWeeks.id))
        .where(and(
          eq(planWeeks.planId, plan.id),
          eq(planWeeks.weekIndex, slot.weekIndex),
          eq(planSessions.dayOfWeek, slot.dayOfWeek),
          eq(planSessions.type, act.type),
          or(
            eq(planSessions.status, 'planned'),
            and(eq(planSessions.status, 'completed'), isNull(planSessions.linkedActivityId)),
          ),
        ))
        .orderBy(asc(planSessions.id))
        .get()
      if (!candidate) continue
      db.update(planSessions)
        .set({ status: 'completed', linkedActivityId: activityId, matchSource: 'auto', completedAt: now })
        .where(eq(planSessions.id, candidate.id))
        .run()
      return candidate.id
    }
    return null
  })
}

/** Alle auto-Zuordnungen des Plans zurücksetzen und neu vergeben (nur aktiver Plan). */
export function rematchPlan(db: TxDb, planId: number, now: number = Date.now()): { reset: number; matched: number } {
  return runInTransaction(db, () => {
    const plan = db.select().from(trainingPlans).where(eq(trainingPlans.id, planId)).get()
    if (!plan || plan.isActive !== 1) return { reset: 0, matched: 0 }

    const weeks = db.select({ id: planWeeks.id }).from(planWeeks).where(eq(planWeeks.planId, planId)).all()
    if (weeks.length === 0) return { reset: 0, matched: 0 }
    const weekIds = weeks.map(w => w.id)

    const reset = db.update(planSessions)
      .set({ status: 'planned', linkedActivityId: null, matchSource: null, completedAt: null })
      .where(and(inArray(planSessions.weekId, weekIds), eq(planSessions.matchSource, 'auto')))
      .run().changes

    const from = plan.startDate
    const to = planEndDate(plan.startDate, weeks.length)
    const acts = db.select().from(activities)
      .where(inArray(activities.type, MATCHABLE_TYPES))
      .orderBy(asc(activities.date), asc(activities.startTime), asc(activities.id))
      .all()
      .filter(a => a.date >= from && a.date <= to)

    let matched = 0
    for (const a of acts) if (matchActivity(db, a.id, now) !== null) matched++
    return { reset: Number(reset), matched }
  })
}

/**
 * VOR dem Löschen einer Aktivität aufrufen: auto-Einheiten → geplant, manuelle verlieren nur
 * den Link (bleiben erledigt). Danach bekommen übrige Aktivitäten desselben Tages eine Chance.
 */
export function releaseActivity(db: TxDb, activityId: number, now: number = Date.now()): void {
  runInTransaction(db, () => {
    const act = db.select().from(activities).where(eq(activities.id, activityId)).get()

    db.update(planSessions)
      .set({ status: 'planned', linkedActivityId: null, matchSource: null, completedAt: null })
      .where(and(eq(planSessions.linkedActivityId, activityId), eq(planSessions.matchSource, 'auto')))
      .run()
    db.update(planSessions)
      .set({ linkedActivityId: null, matchSource: null })
      .where(eq(planSessions.linkedActivityId, activityId))
      .run()

    if (!act) return
    const sameDay = db.select().from(activities)
      .where(and(eq(activities.date, act.date), inArray(activities.type, MATCHABLE_TYPES)))
      .orderBy(asc(activities.startTime), asc(activities.id))
      .all()
    for (const other of sameDay) {
      if (other.id !== activityId) matchActivity(db, other.id, now)
    }
  })
}
