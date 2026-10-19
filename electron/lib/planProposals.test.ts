import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { activities, planProposals, planSessions, planWeeks, trainingPlans, userProfile } from '../../db/schema'
import { makeTestDb, type TestDb } from './testDb'
import {
  applyProposal, createNotFullProposal, getPaceStatus, listOpenProposals, listPendingFeedback,
  rejectProposal, saveFeedback, setPerformance,
} from './planProposals'
import { to10kSec } from '../../src/shared/adapt'

const TODAY = '2026-10-19' // Montag, Woche 0 des Plans
const NOW = new Date('2026-10-19T18:00:00').getTime()

let db: TestDb

/** Plan ab 19.10. (2 Wochen); Einheit-IDs: 1 = Mo locker (heute, gelaufen), 2 = Mi hart, 3 = Sa langer Lauf. */
function seedPlan(d: TestDb) {
  d.insert(userProfile).values({ id: 1, name: 'K', maxHr: 190, restingHr: 50 } as never).run()
  d.insert(trainingPlans).values({ id: 1, name: 'P', startDate: TODAY, isActive: 1, createdAt: 1 }).run()
  d.insert(planWeeks).values([{ id: 1, planId: 1, weekIndex: 0 }, { id: 2, planId: 1, weekIndex: 1 }]).run()
  d.insert(planSessions).values([
    { id: 1, weekId: 1, dayOfWeek: 1, type: 'running', targetDistanceKm: 8, targetHrZone: 2 },
    { id: 2, weekId: 1, dayOfWeek: 3, type: 'running', targetDistanceKm: 10, targetHrZone: 4, targetPaceFastSec: 300, targetPaceSlowSec: 310 },
    { id: 3, weekId: 1, dayOfWeek: 6, type: 'running', targetDistanceKm: 14, targetHrZone: 2 },
  ]).run()
}

/** Lauf anlegen und mit Einheit verknüpfen (wie matchActivity). */
function linkRun(d: TestDb, id: number, sessionId: number, date: string, over: Record<string, unknown> = {}) {
  d.insert(activities).values({
    id, type: 'running', date, createdAt: 1, source: 'manual', distanceKm: 8, durationMin: 48, movingTimeMin: 48, avgHr: 140, ...over,
  } as never).run()
  d.update(planSessions).set({ status: 'completed', linkedActivityId: id, matchSource: 'auto', completedAt: 1 })
    .where(eq(planSessions.id, sessionId)).run()
}

const session = (id: number) => db.select().from(planSessions).where(eq(planSessions.id, id)).get()!

beforeEach(async () => {
  db = await makeTestDb()
  seedPlan(db)
})

describe('listPendingFeedback', () => {
  it('returns matched runs of the last 3 days without feedback, oldest first', () => {
    db.insert(planWeeks).values({ id: 9, planId: 1, weekIndex: -1 } as never).run()
    linkRun(db, 10, 1, TODAY)
    db.insert(planSessions).values([
      { id: 7, weekId: 9, dayOfWeek: 6, type: 'running' }, { id: 8, weekId: 9, dayOfWeek: 2, type: 'running' },
    ]).run()
    linkRun(db, 11, 7, '2026-10-17')
    linkRun(db, 12, 8, '2026-10-13') // zu alt
    expect(listPendingFeedback(db, TODAY).map(p => p.activityId)).toEqual([11, 10])
  })

  it('skipped feedback sets feedback_at, so the run is not asked again', () => {
    linkRun(db, 10, 1, TODAY)
    expect(saveFeedback(db, { activityId: 10, effort: null, pain: false, notes: null, skipped: true }, TODAY, NOW)).toEqual([])
    expect(listPendingFeedback(db, TODAY)).toEqual([])
    expect(db.select().from(activities).get()!.feedbackAt).toBe(NOW)
  })
})

describe('saveFeedback', () => {
  it('effort 9 on easy run creates a run proposal (next hard session −10 %) and stores feedback', () => {
    linkRun(db, 10, 1, TODAY)
    const created = saveFeedback(db, { activityId: 10, effort: 9, pain: false, notes: 'zäh', skipped: false }, TODAY, NOW)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ kind: 'run', changes: [{ action: 'update', sessionId: 2, set: { targetDistanceKm: 9 } }] })
    const a = db.select().from(activities).get()!
    expect([a.perceivedEffort, a.pain, a.notes]).toEqual([9, 0, 'zäh'])
  })

  it('no active plan → stores feedback, returns []', () => {
    db.update(trainingPlans).set({ isActive: 0 }).run()
    db.insert(activities).values({ id: 10, type: 'running', date: TODAY, createdAt: 1, source: 'manual' } as never).run()
    expect(saveFeedback(db, { activityId: 10, effort: 9, pain: false, notes: null, skipped: false }, TODAY, NOW)).toEqual([])
    expect(db.select().from(activities).get()!.perceivedEffort).toBe(9)
  })

  it('new run proposal marks the previous open run proposal stale, keeps open pace proposal', () => {
    linkRun(db, 10, 1, TODAY)
    db.insert(planProposals).values([
      { id: 50, planId: 1, kind: 'run', changes: '[]', reasons: '[]', createdAt: 1 },
      { id: 51, planId: 1, kind: 'pace', changes: '[]', reasons: '[]', createdAt: 1 },
    ]).run()
    saveFeedback(db, { activityId: 10, effort: 9, pain: false, notes: null, skipped: false }, TODAY, NOW)
    const st = Object.fromEntries(db.select().from(planProposals).all().map(p => [p.id, p.status]))
    expect(st[50]).toBe('stale')
    expect(st[51]).toBe('open')
    expect(listOpenProposals(db).map(p => p.kind).sort()).toEqual(['pace', 'run'])
  })
})

describe('applyProposal / rejectProposal', () => {
  it('apply changes plan sessions and marks applied', () => {
    linkRun(db, 10, 1, TODAY)
    const [p] = saveFeedback(db, { activityId: 10, effort: 9, pain: false, notes: null, skipped: false }, TODAY, NOW)
    expect(applyProposal(db, p.id, TODAY, NOW)).toEqual({ status: 'applied' })
    expect(session(2).targetDistanceKm).toBe(9)
    expect(listOpenProposals(db)).toEqual([])
  })

  it('apply after the session was completed → stale, plan unchanged', () => {
    linkRun(db, 10, 1, TODAY)
    const [p] = saveFeedback(db, { activityId: 10, effort: 9, pain: false, notes: null, skipped: false }, TODAY, NOW)
    db.update(planSessions).set({ status: 'completed' }).where(eq(planSessions.id, 2)).run()
    expect(applyProposal(db, p.id, TODAY, NOW)).toEqual({ status: 'stale' })
    expect(session(2).targetDistanceKm).toBe(10)
    expect(db.select().from(planProposals).get()!.status).toBe('stale')
  })

  it('reject marks rejected', () => {
    linkRun(db, 10, 1, TODAY)
    const [p] = saveFeedback(db, { activityId: 10, effort: 9, pain: false, notes: null, skipped: false }, TODAY, NOW)
    rejectProposal(db, p.id, NOW)
    expect(db.select().from(planProposals).get()).toMatchObject({ status: 'rejected', resolvedAt: NOW })
  })

  it('pace proposal apply sets current_10k_sec and scales paces', () => {
    db.update(userProfile).set({ current10kSec: 3000 }).run()
    db.insert(planProposals).values({
      id: 60, planId: 1, kind: 'pace', meta: JSON.stringify({ old10kSec: 3000, new10kSec: 2940 }),
      changes: JSON.stringify([{ action: 'update', sessionId: 2, set: { targetPaceFastSec: 294, targetPaceSlowSec: 304 } }]),
      reasons: '[]', createdAt: 1,
    }).run()
    expect(applyProposal(db, 60, TODAY, NOW)).toEqual({ status: 'applied' })
    expect(db.select().from(userProfile).get()!.current10kSec).toBe(2940)
    expect(session(2).targetPaceFastSec).toBe(294)
  })
})

describe('pace status and performance', () => {
  it('missing performance → suggested10kSec from recent runs', () => {
    db.insert(activities).values({ id: 20, type: 'running', date: '2026-10-10', createdAt: 1, source: 'manual', distanceKm: 10, durationMin: 50 } as never).run()
    expect(getPaceStatus(db, TODAY)).toMatchObject({ state: 'missing', suggested10kSec: 3000, history: [] })
  })

  it('setPerformance 5 km 25:00 stores the 10 km equivalent and scales planned paces', () => {
    db.update(userProfile).set({ current10kSec: 3000 }).run()
    const r = setPerformance(db, { distanceKm: 5, timeSec: 1500 }, TODAY, NOW)
    const ten = to10kSec(1500, 5)
    expect(r.current10kSec).toBe(ten)
    expect(db.select().from(userProfile).get()!.current10kSec).toBe(ten)
    expect(session(2).targetPaceFastSec).toBe(Math.round(300 * ten / 3000))
    expect(r.scaled).toBe(1)
  })

  it('setPerformance without previous value only stores it', () => {
    expect(setPerformance(db, { distanceKm: 10, timeSec: 3000 }, TODAY, NOW)).toEqual({ current10kSec: 3000, scaled: 0 })
    expect(session(2).targetPaceFastSec).toBe(300)
  })
})

describe('createNotFullProposal', () => {
  it('sick 2 days → open not_full proposal with rest day for today', () => {
    const p = createNotFullProposal(db, { reason: 'sick', days: 2 }, TODAY, NOW)!
    expect(p.kind).toBe('not_full')
    expect(p.changes[0]).toMatchObject({ action: 'update', sessionId: 1, set: { type: 'rest' } })
    expect(p.meta).toEqual({ reason: 'sick', days: 2 })
  })
})
