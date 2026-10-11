/**
 * Coach-Änderungen übernehmen: update/move/remove/add auf geplante Einheiten ab heute.
 * Alles in EINER Transaktion – eine fehlerhafte Änderung macht alle rückgängig.
 * Ohne `electron`-Import (testbar mit In-Memory-DB).
 */
import { eq } from 'drizzle-orm'
import { planSessions, planWeeks } from '../../db/schema'
import type { CoachApplyPayload, CoachChange } from '../../src/types/ipcContract'
import { sessionDate } from '../../src/shared/planCalendar'
import { createSession, deleteSession, updateSession } from './planWrite'
import { getPlanRow } from './planRead'
import { runInTransaction, type TxDb } from './transaction'

const DAY_MS = 86_400_000
const noon = (d: string): number => new Date(`${d}T12:00:00Z`).getTime()

/** Datum → Woche/Wochentag im Plan; wirft, wenn es vor heute oder außerhalb des Plans liegt. */
function locate(
  plan: { startDate: string; weekCount: number }, date: string, today: string,
): { weekIndex: number; dayOfWeek: number } {
  if (date < today) throw new Error(`Das Datum ${date} liegt in der Vergangenheit.`)
  const days = Math.round((noon(date) - noon(plan.startDate)) / DAY_MS)
  const weekIndex = Math.floor(days / 7)
  if (days < 0 || weekIndex >= plan.weekCount) throw new Error(`Das Datum ${date} liegt außerhalb des Plans.`)
  return { weekIndex, dayOfWeek: (days % 7) + 1 }
}

function requireChangeable(db: TxDb, plan: { id: number; startDate: string }, sessionId: number, today: string): void {
  const row = db.select({
    status: planSessions.status, dayOfWeek: planSessions.dayOfWeek,
    weekIndex: planWeeks.weekIndex, planId: planWeeks.planId,
  }).from(planSessions).innerJoin(planWeeks, eq(planWeeks.id, planSessions.weekId))
    .where(eq(planSessions.id, sessionId)).get()
  if (!row) throw new Error(`Einheit #${sessionId} gibt es nicht.`)
  if (row.planId !== plan.id) throw new Error(`Einheit #${sessionId} gehört nicht zu diesem Plan.`)
  if (row.status !== 'planned') {
    throw new Error(`Einheit #${sessionId} ist bereits ${row.status === 'completed' ? 'erledigt' : 'übersprungen'} und kann nicht geändert werden.`)
  }
  if (sessionDate(plan.startDate, row.weekIndex, row.dayOfWeek) < today) {
    throw new Error(`Einheit #${sessionId} liegt in der Vergangenheit und kann nicht geändert werden.`)
  }
}

export function applyCoachChanges(db: TxDb, p: CoachApplyPayload, today: string): { applied: number } {
  return runInTransaction(db, () => {
    const plan = getPlanRow(db, p.planId)
    if (!plan) throw new Error('Plan nicht gefunden.')

    const apply = (c: CoachChange): void => {
      switch (c.action) {
        case 'update':
          requireChangeable(db, plan, c.sessionId, today)
          updateSession(db, { sessionId: c.sessionId, ...c.set })
          return
        case 'move':
          requireChangeable(db, plan, c.sessionId, today)
          updateSession(db, { sessionId: c.sessionId, ...locate(plan, c.date, today) })
          return
        case 'remove':
          requireChangeable(db, plan, c.sessionId, today)
          deleteSession(db, c.sessionId)
          return
        case 'add': {
          const pos = locate(plan, c.date, today)
          const fast = c.session.targetPaceFastSec
          const slow = c.session.targetPaceSlowSec
          if (fast != null && slow != null && fast > slow) throw new Error('Pace: schneller Wert muss kleiner sein')
          createSession(db, { planId: p.planId, ...pos, ...c.session })
        }
      }
    }

    p.changes.forEach(apply)
    return { applied: p.changes.length }
  })
}
