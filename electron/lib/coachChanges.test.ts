import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { planSessions } from '../../db/schema'
import { makeTestDb, type TestDb } from './testDb'
import { createPlan, setSessionStatus } from './planWrite'
import { getPlanDetail } from './planRead'
import { applyCoachChanges } from './coachChanges'

// Plan ab Mo 2026-10-05, 3 Wochen; "heute" = Mi 2026-10-14
const TODAY = '2026-10-14'
let db: TestDb
let planId: number
let past: number
let future1: number
let future2: number

const run = (day: number) => ({ dayOfWeek: day, type: 'running' as const, targetDistanceKm: 10 })

const snapshot = () => JSON.stringify(db.select().from(planSessions).all())

beforeEach(async () => {
  db = await makeTestDb()
  const plan = createPlan(db, {
    name: 'P', startDate: '2026-10-05',
    weeks: [{ sessions: [run(2)] }, { sessions: [run(4), run(6)] }, { sessions: [] }],
  })
  planId = plan.id
  const all = getPlanDetail(db, planId)!.weeks.flatMap(w => w.sessions)
  past = all[0].id // 06.10.
  future1 = all[1].id // 15.10.
  future2 = all[2].id // 17.10.
})

const dateOf = (id: number) =>
  getPlanDetail(db, planId)!.weeks.flatMap(w => w.sessions).find(s => s.id === id)?.date

describe('applyCoachChanges', () => {
  it('update ändert Felder', () => {
    const r = applyCoachChanges(db, {
      planId,
      changes: [{ action: 'update', sessionId: future1, set: { targetDistanceKm: 8, targetPaceFastSec: 360, targetPaceSlowSec: 380 } }],
    }, TODAY)
    expect(r.applied).toBe(1)
    const s = db.select().from(planSessions).where(eq(planSessions.id, future1)).get()!
    expect(s.targetDistanceKm).toBe(8)
    expect(s.targetPaceFastSec).toBe(360)
  })

  it('move verschiebt auf neues Datum', () => {
    applyCoachChanges(db, { planId, changes: [{ action: 'move', sessionId: future1, date: '2026-10-18' }] }, TODAY)
    expect(dateOf(future1)).toBe('2026-10-18')
  })

  it('remove löscht', () => {
    applyCoachChanges(db, { planId, changes: [{ action: 'remove', sessionId: future2 }] }, TODAY)
    expect(dateOf(future2)).toBeUndefined()
  })

  it('add legt Einheit in der dritten Woche an', () => {
    applyCoachChanges(db, {
      planId,
      changes: [{ action: 'add', date: '2026-10-20', session: { type: 'running', title: 'Neu', targetDistanceKm: 6 } }],
    }, TODAY)
    const w3 = getPlanDetail(db, planId)!.weeks[2].sessions
    expect(w3).toHaveLength(1)
    expect(w3[0].date).toBe('2026-10-20')
    expect(w3[0].title).toBe('Neu')
  })

  it('add lehnt vertauschte Pace ab', () => {
    expect(() => applyCoachChanges(db, {
      planId,
      changes: [{ action: 'add', date: '2026-10-20', session: { type: 'running', targetPaceFastSec: 400, targetPaceSlowSec: 350 } }],
    }, TODAY)).toThrow(/Pace/)
  })

  it('lehnt vergangene Einheit ab', () => {
    expect(() => applyCoachChanges(db, { planId, changes: [{ action: 'remove', sessionId: past }] }, TODAY))
      .toThrow(`Einheit #${past} liegt in der Vergangenheit`)
  })

  it('lehnt erledigte Einheit ab', () => {
    setSessionStatus(db, { sessionId: future1, status: 'completed' })
    expect(() => applyCoachChanges(db, {
      planId, changes: [{ action: 'update', sessionId: future1, set: { title: 'x' } }],
    }, TODAY)).toThrow(`Einheit #${future1} ist bereits erledigt und kann nicht geändert werden.`)
  })

  it('lehnt Einheit eines anderen Plans ab', () => {
    const other = createPlan(db, { name: 'Q', startDate: '2026-10-05', weeks: [{ sessions: [run(5)] }] })
    const foreign = getPlanDetail(db, other.id)!.weeks[0].sessions[0].id
    expect(() => applyCoachChanges(db, { planId, changes: [{ action: 'remove', sessionId: foreign }] }, TODAY))
      .toThrow(/gehört nicht zu diesem Plan/)
  })

  it('lehnt Ziel-Datum außerhalb des Plans oder in der Vergangenheit ab', () => {
    expect(() => applyCoachChanges(db, { planId, changes: [{ action: 'move', sessionId: future1, date: '2026-11-30' }] }, TODAY))
      .toThrow(/außerhalb des Plans/)
    expect(() => applyCoachChanges(db, { planId, changes: [{ action: 'move', sessionId: future1, date: '2026-10-10' }] }, TODAY))
      .toThrow(/Vergangenheit/)
  })

  it('Fehler in der 2. Änderung macht die 1. rückgängig', () => {
    const before = snapshot()
    expect(() => applyCoachChanges(db, {
      planId,
      changes: [
        { action: 'update', sessionId: future1, set: { targetDistanceKm: 3 } },
        { action: 'remove', sessionId: past },
      ],
    }, TODAY)).toThrow()
    expect(snapshot()).toBe(before)
  })

  it('unbekannter Plan wirft', () => {
    expect(() => applyCoachChanges(db, { planId: 9999, changes: [{ action: 'remove', sessionId: 1 }] }, TODAY))
      .toThrow(/Plan nicht gefunden/)
  })
})
