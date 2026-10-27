/**
 * Automatische Zuordnung Lauf ↔ Plan-Einheit (siehe Spec „Automatische Zuordnung").
 * Nur aktive Pläne, gleicher Typ, höchstens eine Einheit pro Aktivität. Suchreihenfolge:
 * 1. gleicher (lokaler) Tag (offene oder erledigte ohne Link), 2. Einheit vom Vortag (nachgeholt),
 * 3. Einheit vom Folgetag (vorgezogen) – bei 2 und 3 nur offene ('planned'). 'skipped' bleibt tabu.
 * Alle Funktionen laufen in `runInTransaction` (verschachtelt = Savepoint). Ohne `electron`-Import.
 */
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm'
import { activities, planSessions, planWeeks, trainingPlans } from '../../db/schema'
import { addDaysStr, currentWeekIndex, planEndDate, sessionDate } from '../../src/shared/planCalendar'
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

type PlanRow = typeof trainingPlans.$inferSelect

/** Erste passende Einheit des Plans an `date`; `plannedOnly` = nur offene (kein „erledigt ohne Link"). */
function findCandidate(db: TxDb, plan: PlanRow, date: string, type: string, plannedOnly: boolean): number | null {
  const slot = slotOf(plan.startDate, date)
  if (!slot) return null
  const statusOk = plannedOnly
    ? eq(planSessions.status, 'planned')
    : or(
      eq(planSessions.status, 'planned'),
      and(eq(planSessions.status, 'completed'), isNull(planSessions.linkedActivityId)),
    )
  const row = db
    .select({ id: planSessions.id })
    .from(planSessions)
    .innerJoin(planWeeks, eq(planSessions.weekId, planWeeks.id))
    .where(and(
      eq(planWeeks.planId, plan.id),
      eq(planWeeks.weekIndex, slot.weekIndex),
      eq(planSessions.dayOfWeek, slot.dayOfWeek),
      eq(planSessions.type, type),
      statusOk,
    ))
    .orderBy(asc(planSessions.id))
    .get()
  return row ? row.id : null
}

/**
 * Ordnet eine Aktivität der passenden Einheit zu. Gibt die Session-ID zurück oder null.
 * `sameDayOnly` = nur Stufe 1 (gleicher Tag), sonst zusätzlich Vortag und Folgetag.
 */
export function matchActivity(
  db: TxDb, activityId: number, now: number = Date.now(), opts: { sameDayOnly?: boolean } = {},
): number | null {
  return runInTransaction(db, () => {
    const act = db.select().from(activities).where(eq(activities.id, activityId)).get()
    if (!act || !MATCHABLE_TYPES.includes(act.type)) return null

    const alreadyLinked = db.select({ id: planSessions.id }).from(planSessions)
      .where(eq(planSessions.linkedActivityId, activityId)).get()
    if (alreadyLinked) return null

    const plans = db.select().from(trainingPlans).where(eq(trainingPlans.isActive, 1)).all()
    const stages: { date: string; plannedOnly: boolean }[] = [{ date: act.date, plannedOnly: false }]
    if (!opts.sameDayOnly) {
      stages.push({ date: addDaysStr(act.date, -1), plannedOnly: true })
      stages.push({ date: addDaysStr(act.date, 1), plannedOnly: true })
    }
    for (const stage of stages) {
      for (const plan of plans) {
        const id = findCandidate(db, plan, stage.date, act.type, stage.plannedOnly)
        if (id === null) continue
        db.update(planSessions)
          .set({ status: 'completed', linkedActivityId: activityId, matchSource: 'auto', completedAt: now })
          .where(eq(planSessions.id, id))
          .run()
        return id
      }
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

    // ±1 Tag Rand: nachgeholte/vorgezogene Läufe neben dem Plan können eine Einheit im Plan treffen
    const from = addDaysStr(plan.startDate, -1)
    const to = addDaysStr(planEndDate(plan.startDate, weeks.length), 1)
    const acts = db.select().from(activities)
      .where(inArray(activities.type, MATCHABLE_TYPES))
      .orderBy(asc(activities.date), asc(activities.startTime), asc(activities.id))
      .all()
      .filter(a => a.date >= from && a.date <= to)

    // Durchgang 1: nur gleicher Tag; Durchgang 2: Rest mit ±1 Tag (sonst nimmt ein vorgezogener Lauf
    // die Einheit eines Tages weg, an dem selbst gelaufen wurde)
    let matched = 0
    for (const a of acts) if (matchActivity(db, a.id, now, { sameDayOnly: true }) !== null) matched++
    for (const a of acts) if (matchActivity(db, a.id, now) !== null) matched++
    return { reset: Number(reset), matched }
  })
}

/**
 * VOR dem Löschen einer Aktivität aufrufen: auto-Einheiten → geplant, manuelle verlieren nur
 * den Link (bleiben erledigt). Danach bekommen übrige Aktivitäten von Vortag, gleichem Tag und Folgetag
 * eine Chance (gleicher Tag zuerst).
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
    const near = db.select().from(activities)
      .where(and(
        inArray(activities.date, [addDaysStr(act.date, -1), act.date, addDaysStr(act.date, 1)]),
        inArray(activities.type, MATCHABLE_TYPES),
      ))
      .orderBy(asc(activities.date), asc(activities.startTime), asc(activities.id))
      .all()
    const ordered = [...near.filter(o => o.date === act.date), ...near.filter(o => o.date !== act.date)]
    for (const other of ordered) {
      if (other.id !== activityId) matchActivity(db, other.id, now)
    }
  })
}
