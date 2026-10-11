import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { activities, planSessions, planWeeks, trainingPlans } from '../../db/schema'
import type { CreatePlanPayload } from '../../src/types/ipc'
import { makeTestDb, type TestDb } from './testDb'
import {
  createPlan, createEmptyPlan, updatePlan, activatePlan, adaptPlan, createSession, updateSession,
  deleteSession, setSessionStatus, linkSessionActivity,
} from './planWrite'
import { getPlanDetail } from './planRead'

const NOW = 1_800_000_000_000
let db: TestDb

const run = (day: number, over: Record<string, unknown> = {}) => ({ dayOfWeek: day, type: 'running' as const, ...over })

const twoWeeks = (over: Partial<CreatePlanPayload> = {}): CreatePlanPayload => ({
  name: 'Plan', startDate: '2026-10-05',
  weeks: [{ phase: 'Basis', sessions: [run(2), run(4)] }, { sessions: [run(2)] }],
  ...over,
})

function addActivity(date: string, over: Partial<typeof activities.$inferInsert> = {}): number {
  const [a] = db.insert(activities).values({
    type: 'running', date, createdAt: 1, source: 'manual', distanceKm: 8, durationMin: 50, ...over,
  }).returning().all()
  return a.id
}

const sess = (id: number) => db.select().from(planSessions).where(eq(planSessions.id, id)).get()!

beforeEach(async () => { db = await makeTestDb() })

describe('createPlan', () => {
  it('legt Wochen mit berechneten Daten an', () => {
    const plan = createPlan(db, twoWeeks(), NOW)
    expect(plan.weekCount).toBe(2)
    const d = getPlanDetail(db, plan.id)!
    expect(d.weeks.map(w => [w.from, w.to])).toEqual([['2026-10-05', '2026-10-11'], ['2026-10-12', '2026-10-18']])
    expect(d.weeks[0].phase).toBe('Basis')
    expect(d.weeks[0].sessions.map(s => s.date)).toEqual(['2026-10-06', '2026-10-08'])
    expect(d.weeks[1].sessions[0].date).toBe('2026-10-13')
  })

  it('der zweite Plan setzt den ersten inaktiv', () => {
    const a = createPlan(db, twoWeeks(), NOW)
    const b = createPlan(db, twoWeeks({ name: 'Zweiter' }), NOW + 1)
    const rows = db.select().from(trainingPlans).all()
    expect(rows.find(r => r.id === a.id)!.isActive).toBe(0)
    expect(rows.find(r => r.id === b.id)!.isActive).toBe(1)
  })

  it('ordnet beim Anlegen vorhandene Läufe sofort zu', () => {
    addActivity('2026-10-06')
    const plan = createPlan(db, twoWeeks(), NOW)
    const s = getPlanDetail(db, plan.id)!.weeks[0].sessions[0]
    expect(s.status).toBe('completed')
    expect(s.matchSource).toBe('auto')
    expect(s.activity?.distanceKm).toBe(8)
  })

  it('speichert Intervalle als JSON und liest sie geparst zurück', () => {
    const steps = [{ repeat: 6, steps: [{ kind: 'work' as const, distanceM: 800 }] }]
    const plan = createPlan(db, twoWeeks({ weeks: [{ sessions: [run(2, { steps })] }] }), NOW)
    expect(getPlanDetail(db, plan.id)!.weeks[0].sessions[0].steps).toEqual(steps)
  })

  it('kaputtes steps-JSON ergibt null statt Fehler', () => {
    const plan = createPlan(db, twoWeeks(), NOW)
    const id = getPlanDetail(db, plan.id)!.weeks[0].sessions[0].id
    db.update(planSessions).set({ steps: '{kaputt' }).where(eq(planSessions.id, id)).run()
    expect(getPlanDetail(db, plan.id)!.weeks[0].sessions[0].steps).toBeNull()
  })
})

describe('createEmptyPlan / updatePlan', () => {
  it('legt leere Wochen an', () => {
    const plan = createEmptyPlan(db, { name: 'Leer', startDate: '2026-10-12', weekCount: 4 }, NOW)
    expect(plan.weekCount).toBe(4)
    expect(getPlanDetail(db, plan.id)!.weeks.every(w => w.sessions.length === 0)).toBe(true)
  })

  it('Verkürzen mit Einheiten in wegfallender Woche wirft, nichts ändert sich', () => {
    const plan = createPlan(db, twoWeeks({ weeks: [{ sessions: [] }, { sessions: [] }, { sessions: [run(2)] }] }), NOW)
    expect(() => updatePlan(db, { planId: plan.id, weekCount: 1 })).toThrow('Woche 3 enthält noch Einheiten')
    expect(getPlanDetail(db, plan.id)!.weeks).toHaveLength(3)
  })

  it('Verkürzen ohne Einheiten löscht Wochen, Verlängern hängt leere an', () => {
    const plan = createEmptyPlan(db, { name: 'X', startDate: '2026-10-12', weekCount: 3 }, NOW)
    expect(updatePlan(db, { planId: plan.id, weekCount: 1 }).weekCount).toBe(1)
    expect(updatePlan(db, { planId: plan.id, weekCount: 5 }).weekCount).toBe(5)
    expect(getPlanDetail(db, plan.id)!.weeks.map(w => w.weekIndex)).toEqual([0, 1, 2, 3, 4])
  })

  it('Startdatum ändern ordnet neu zu', () => {
    addActivity('2026-10-06')
    const plan = createPlan(db, twoWeeks(), NOW)
    updatePlan(db, { planId: plan.id, startDate: '2026-10-12' })
    const d = getPlanDetail(db, plan.id)!
    expect(d.startDate).toBe('2026-10-12')
    expect(d.weeks.flatMap(w => w.sessions).every(s => s.status === 'planned')).toBe(true)
  })

  it('wirft bei unbekanntem Plan', () => {
    expect(() => updatePlan(db, { planId: 999, name: 'x' })).toThrow('Plan nicht gefunden')
  })
})

describe('activatePlan', () => {
  it('aktiviert einen Plan und deaktiviert die anderen', () => {
    const a = createPlan(db, twoWeeks(), NOW)
    const b = createPlan(db, twoWeeks(), NOW + 1)
    activatePlan(db, a.id)
    const rows = db.select().from(trainingPlans).all()
    expect(rows.find(r => r.id === a.id)!.isActive).toBe(1)
    expect(rows.find(r => r.id === b.id)!.isActive).toBe(0)
  })
})

describe('adaptPlan', () => {
  it('behält eine erledigte Einheit an gleicher Position, verwirft nicht passende', () => {
    const plan = createPlan(db, twoWeeks(), NOW)
    const d = getPlanDetail(db, plan.id)!
    const tue = d.weeks[0].sessions[0].id // Woche 0, Di, running
    const thu = d.weeks[0].sessions[1].id // Woche 0, Do, running
    setSessionStatus(db, { sessionId: tue, status: 'completed', completionNote: 'gut' }, NOW)
    setSessionStatus(db, { sessionId: thu, status: 'skipped' }, NOW)

    // Neuer Plan: Di bleibt, Do entfällt (jetzt Fr)
    const res = adaptPlan(db, {
      planId: plan.id, name: 'Neu', startDate: '2026-10-05',
      weeks: [{ sessions: [run(2), run(5)] }],
    })
    expect(res).toEqual({ preserved: 2, restored: 1 })

    const nd = getPlanDetail(db, plan.id)!
    expect(nd.name).toBe('Neu')
    expect(nd.weeks).toHaveLength(1)
    const [s1, s2] = nd.weeks[0].sessions
    expect(s1.status).toBe('completed')
    expect(s1.completionNote).toBe('gut')
    expect(s2.status).toBe('planned')
  })
})

describe('Einheiten', () => {
  it('createSession in nicht vorhandener Woche wirft', () => {
    const plan = createPlan(db, twoWeeks(), NOW)
    expect(() => createSession(db, { planId: plan.id, weekIndex: 5, dayOfWeek: 1, type: 'rest' }))
      .toThrow('Woche 6 gibt es in diesem Plan nicht.')
  })

  it('createSession / updateSession (verschieben) / deleteSession', () => {
    const plan = createPlan(db, twoWeeks(), NOW)
    const s = createSession(db, { planId: plan.id, weekIndex: 1, dayOfWeek: 7, type: 'running', title: 'Lang', targetDistanceKm: 16 })
    expect(s.date).toBe('2026-10-18')
    const moved = updateSession(db, { sessionId: s.id, weekIndex: 0, dayOfWeek: 6, targetPaceFastSec: 330, targetPaceSlowSec: 350 })
    expect(moved.date).toBe('2026-10-10')
    expect(moved.targetPaceFastSec).toBe(330)
    expect(moved.title).toBe('Lang')
    expect(() => updateSession(db, { sessionId: s.id, weekIndex: 9 })).toThrow('Woche 10 gibt es')
    expect(() => updateSession(db, { sessionId: s.id, targetPaceFastSec: 400 })).toThrow('Pace')
    deleteSession(db, s.id)
    expect(db.select().from(planSessions).where(eq(planSessions.id, s.id)).all()).toHaveLength(0)
  })

  it('Verschieben löst eine automatische Zuordnung', () => {
    addActivity('2026-10-06')
    const plan = createPlan(db, twoWeeks(), NOW)
    const first = getPlanDetail(db, plan.id)!.weeks[0].sessions[0]
    expect(first.status).toBe('completed')
    const moved = updateSession(db, { sessionId: first.id, dayOfWeek: 5 })
    expect(moved.status).toBe('planned')
    expect(moved.activity).toBeNull()
  })
})

describe('Status und Verknüpfung', () => {
  it('skipped entfernt Link und matchSource', () => {
    addActivity('2026-10-06')
    const plan = createPlan(db, twoWeeks(), NOW)
    const id = getPlanDetail(db, plan.id)!.weeks[0].sessions[0].id
    setSessionStatus(db, { sessionId: id, status: 'skipped' }, NOW)
    const s = sess(id)
    expect(s.status).toBe('skipped')
    expect(s.linkedActivityId).toBeNull()
    expect(s.matchSource).toBeNull()
  })

  it('completed setzt completedAt (Payload oder jetzt)', () => {
    const plan = createPlan(db, twoWeeks(), NOW)
    const [a, b] = getPlanDetail(db, plan.id)!.weeks[0].sessions
    setSessionStatus(db, { sessionId: a.id, status: 'completed' }, NOW)
    setSessionStatus(db, { sessionId: b.id, status: 'completed', completedAt: 42 }, NOW)
    expect(sess(a.id).completedAt).toBe(NOW)
    expect(sess(b.id).completedAt).toBe(42)
  })

  it('linkSessionActivity löst die Aktivität von der alten Einheit', () => {
    const act = addActivity('2026-10-06')
    const plan = createPlan(db, twoWeeks(), NOW)
    const [a, b] = getPlanDetail(db, plan.id)!.weeks[0].sessions
    expect(a.linkedActivityId).toBe(act)

    linkSessionActivity(db, { sessionId: b.id, activityId: act }, NOW)
    expect(sess(a.id).status).toBe('planned')
    expect(sess(a.id).linkedActivityId).toBeNull()
    expect(sess(b.id).linkedActivityId).toBe(act)
    expect(sess(b.id).matchSource).toBe('manual')
    expect(sess(b.id).status).toBe('completed')

    linkSessionActivity(db, { sessionId: b.id, activityId: null }, NOW)
    expect(sess(b.id).status).toBe('planned')
    expect(sess(b.id).linkedActivityId).toBeNull()
  })

  it('linkSessionActivity mit unbekannter Aktivität wirft', () => {
    const plan = createPlan(db, twoWeeks(), NOW)
    const id = getPlanDetail(db, plan.id)!.weeks[0].sessions[0].id
    expect(() => linkSessionActivity(db, { sessionId: id, activityId: 999 })).toThrow('Aktivität nicht gefunden')
  })
})

it('Plan löschen entfernt Wochen und Einheiten (CASCADE)', () => {
  const plan = createPlan(db, twoWeeks(), NOW)
  db.delete(trainingPlans).where(eq(trainingPlans.id, plan.id)).run()
  expect(db.select().from(planWeeks).all()).toHaveLength(0)
  expect(db.select().from(planSessions).all()).toHaveLength(0)
})
