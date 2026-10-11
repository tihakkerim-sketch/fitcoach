import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { activities, trainingPlans, planWeeks, planSessions } from '../../db/schema'
import { makeTestDb, type TestDb } from './testDb'
import { matchActivity, rematchPlan, releaseActivity } from './matchSessions'

const NOW = 1_800_000_000_000
let db: TestDb

function addPlan(over: Partial<typeof trainingPlans.$inferInsert> = {}): number {
  const [p] = db.insert(trainingPlans).values({
    name: 'Test', startDate: '2026-10-05', isActive: 1, createdAt: 1, ...over,
  }).returning().all()
  return p.id
}

function addWeek(planId: number, weekIndex: number): number {
  const [w] = db.insert(planWeeks).values({ planId, weekIndex }).returning().all()
  return w.id
}

function addSession(weekId: number, dayOfWeek: number, over: Partial<typeof planSessions.$inferInsert> = {}): number {
  const [s] = db.insert(planSessions).values({ weekId, dayOfWeek, type: 'running', ...over }).returning().all()
  return s.id
}

function addActivity(date: string, over: Partial<typeof activities.$inferInsert> = {}): number {
  const [a] = db.insert(activities).values({
    type: 'running', date, createdAt: 1, source: 'manual', distanceKm: 8, durationMin: 50, ...over,
  }).returning().all()
  return a.id
}

const session = (id: number) => db.select().from(planSessions).where(eq(planSessions.id, id)).get()!

describe('matchActivity', () => {
  let weekId: number
  let planId: number
  beforeEach(async () => {
    db = await makeTestDb()
    planId = addPlan()
    weekId = addWeek(planId, 0)
  })

  it('ordnet einen Lauf der Lauf-Einheit am selben Tag zu', () => {
    const sid = addSession(weekId, 2) // Di 06.10.
    const aid = addActivity('2026-10-06')
    expect(matchActivity(db, aid, NOW)).toBe(sid)
    const s = session(sid)
    expect(s.status).toBe('completed')
    expect(s.matchSource).toBe('auto')
    expect(s.linkedActivityId).toBe(aid)
    expect(s.completedAt).toBe(NOW)
  })

  it('ordnet kein Rad einer Lauf-Einheit zu', () => {
    const sid = addSession(weekId, 2)
    const aid = addActivity('2026-10-06', { type: 'cycling' })
    expect(matchActivity(db, aid, NOW)).toBeNull()
    expect(session(sid).status).toBe('planned')
  })

  it('lässt übersprungene Einheiten in Ruhe', () => {
    const sid = addSession(weekId, 2, { status: 'skipped' })
    const aid = addActivity('2026-10-06')
    expect(matchActivity(db, aid, NOW)).toBeNull()
    expect(session(sid).status).toBe('skipped')
  })

  it('ordnet nichts zu, wenn der Plan nicht aktiv ist', () => {
    db.update(trainingPlans).set({ isActive: 0 }).where(eq(trainingPlans.id, planId)).run()
    addSession(weekId, 2)
    expect(matchActivity(db, addActivity('2026-10-06'), NOW)).toBeNull()
  })

  it('ordnet einen Lauf vor dem Planstart nicht zu', () => {
    addSession(weekId, 7)
    expect(matchActivity(db, addActivity('2026-10-04'), NOW)).toBeNull()
  })

  it('ordnet zwei Läufe zwei Einheiten am selben Tag zu, kleinste ID zuerst', () => {
    const s1 = addSession(weekId, 2)
    const s2 = addSession(weekId, 2)
    const a1 = addActivity('2026-10-06', { startTime: '07:00' })
    const a2 = addActivity('2026-10-06', { startTime: '18:00' })
    expect(matchActivity(db, a1, NOW)).toBe(s1)
    expect(matchActivity(db, a2, NOW)).toBe(s2)
  })

  it('ordnet eine schon verknüpfte Aktivität nicht noch einmal zu', () => {
    addSession(weekId, 2)
    const s2 = addSession(weekId, 2)
    const a1 = addActivity('2026-10-06')
    matchActivity(db, a1, NOW)
    expect(matchActivity(db, a1, NOW)).toBeNull()
    expect(session(s2).status).toBe('planned')
  })

  it('zwei Läufe, eine Einheit: zweiter bleibt frei, nach Löschen des ersten bekommt ihn die Einheit', () => {
    const sid = addSession(weekId, 2)
    const a1 = addActivity('2026-10-06', { startTime: '07:00' })
    const a2 = addActivity('2026-10-06', { startTime: '18:00' })
    expect(matchActivity(db, a1, NOW)).toBe(sid)
    expect(matchActivity(db, a2, NOW)).toBeNull()

    releaseActivity(db, a1, NOW)
    db.delete(activities).where(eq(activities.id, a1)).run()

    const s = session(sid)
    expect(s.linkedActivityId).toBe(a2)
    expect(s.status).toBe('completed')
    expect(s.matchSource).toBe('auto')
  })
})

describe('releaseActivity', () => {
  beforeEach(async () => { db = await makeTestDb() })

  it('setzt eine auto-Einheit zurück auf geplant', () => {
    const w = addWeek(addPlan(), 0)
    const sid = addSession(w, 2)
    const aid = addActivity('2026-10-06')
    matchActivity(db, aid, NOW)
    releaseActivity(db, aid, NOW)
    const s = session(sid)
    expect(s.status).toBe('planned')
    expect(s.linkedActivityId).toBeNull()
    expect(s.matchSource).toBeNull()
    expect(s.completedAt).toBeNull()
  })

  it('manuell verknüpfte Einheit bleibt erledigt, nur der Link fällt weg', () => {
    const w = addWeek(addPlan(), 0)
    const aid = addActivity('2026-10-06')
    const sid = addSession(w, 2, { status: 'completed', linkedActivityId: aid, matchSource: 'manual', completedAt: 5 })
    releaseActivity(db, aid, NOW)
    const s = session(sid)
    expect(s.status).toBe('completed')
    expect(s.linkedActivityId).toBeNull()
    expect(s.matchSource).toBeNull()
  })
})

describe('rematchPlan', () => {
  beforeEach(async () => { db = await makeTestDb() })

  it('tut nichts bei inaktivem Plan', () => {
    const planId = addPlan({ isActive: 0 })
    addSession(addWeek(planId, 0), 2)
    addActivity('2026-10-06')
    expect(rematchPlan(db, planId, NOW)).toEqual({ reset: 0, matched: 0 })
  })

  it('ordnet nach Startdatum-Wechsel neu zu, manuelle Zuordnung bleibt', () => {
    const planId = addPlan() // Start 05.10.
    const w0 = addWeek(planId, 0)
    const autoSid = addSession(w0, 2) // 06.10.
    const manualAct = addActivity('2026-10-08')
    const manualSid = addSession(w0, 4, { status: 'completed', linkedActivityId: manualAct, matchSource: 'manual', completedAt: 1 })
    const a = addActivity('2026-10-06')
    expect(matchActivity(db, a, NOW)).toBe(autoSid)

    db.update(trainingPlans).set({ startDate: '2026-10-12' }).where(eq(trainingPlans.id, planId)).run()
    const res = rematchPlan(db, planId, NOW)

    expect(res.reset).toBe(1)
    expect(res.matched).toBe(0) // Lauf vom 06.10. liegt jetzt vor dem Start
    expect(session(autoSid).status).toBe('planned')
    expect(session(autoSid).linkedActivityId).toBeNull()
    expect(session(manualSid).matchSource).toBe('manual')
    expect(session(manualSid).linkedActivityId).toBe(manualAct)
  })

  it('ordnet vorhandene Läufe im Plan-Zeitraum zu', () => {
    const planId = addPlan()
    const sid = addSession(addWeek(planId, 0), 3) // 07.10.
    const aid = addActivity('2026-10-07')
    expect(rematchPlan(db, planId, NOW)).toEqual({ reset: 0, matched: 1 })
    expect(session(sid).linkedActivityId).toBe(aid)
  })
})
