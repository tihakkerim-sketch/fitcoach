import { describe, it, expect, beforeEach } from 'vitest'
import { trainingPlans, planPhases, planWeeks, planSessions } from '../../db/schema'
import { adaptPlan } from './adaptPlan'
import { makeTestDb, type TestDb } from './testDb'

type Sess = { dayOfWeek: number; type: string }

function seedPlan(db: TestDb) {
  const [plan] = db.insert(trainingPlans)
    .values({ name: 'Old', isActive: 1, createdAt: 1 }).returning().all()
  const [phase] = db.insert(planPhases)
    .values({ planId: plan.id, name: 'Base', orderIndex: 0, durationWeeks: 1 }).returning().all()
  const [week] = db.insert(planWeeks)
    .values({ phaseId: phase.id, weekNumber: 1 }).returning().all()
  db.insert(planSessions).values([
    { weekId: week.id, dayOfWeek: 0, type: 'running', status: 'completed', completedAt: 111, completionNote: 'ok' },
    { weekId: week.id, dayOfWeek: 2, type: 'running', status: 'skipped' },
    { weekId: week.id, dayOfWeek: 4, type: 'running', status: 'planned' },
  ]).run()
  return plan.id
}

function payload(planId: number, sessions: Sess[]) {
  return {
    planId,
    name: 'New',
    goalEvent: 'Marathon',
    phases: [{
      name: 'Base2', orderIndex: 0, durationWeeks: 1,
      weeks: [{ weekNumber: 1, sessions }],
    }],
  } as never
}

describe('adaptPlan', () => {
  let db: TestDb
  let planId: number

  beforeEach(async () => {
    db = await makeTestDb()
    planId = seedPlan(db)
  })

  it('restores completed/skipped sessions onto matching slots and counts them', () => {
    // day 0 + day 2 still exist, day 4 (planned) is replaced; day 2 moves to type cycling
    const result = adaptPlan(db, payload(planId, [
      { dayOfWeek: 0, type: 'running' },
      { dayOfWeek: 2, type: 'cycling' },
      { dayOfWeek: 5, type: 'strength' },
    ]))

    expect(result).toEqual({ preserved: 2, restored: 2 })

    const rows = db.select().from(planSessions).all()
    expect(rows).toHaveLength(3)
    const byDay = new Map(rows.map(r => [r.dayOfWeek, r]))
    expect(byDay.get(0)).toMatchObject({ status: 'completed', completedAt: 111, completionNote: 'ok' })
    expect(byDay.get(2)).toMatchObject({ status: 'skipped', type: 'cycling' })
    expect(byDay.get(5)).toMatchObject({ status: 'planned' })

    const plan = db.select().from(trainingPlans).all()[0]
    expect(plan).toMatchObject({ name: 'New', goalEvent: 'Marathon' })
    expect(db.select().from(planPhases).all()[0].name).toBe('Base2')
  })

  it('counts history as preserved-but-not-restored when no slot matches', () => {
    const result = adaptPlan(db, payload(planId, [{ dayOfWeek: 6, type: 'running' }]))
    expect(result).toEqual({ preserved: 2, restored: 0 })
  })

  it('rolls back completely when inserting the new structure fails midway', () => {
    expect(() =>
      adaptPlan(db, payload(planId, [
        { dayOfWeek: 0, type: 'running' },
        { dayOfWeek: 1, type: null as never },
      ]))
    ).toThrow()

    // Original structure fully intact
    const plan = db.select().from(trainingPlans).all()[0]
    expect(plan.name).toBe('Old')
    const phases = db.select().from(planPhases).all()
    expect(phases).toHaveLength(1)
    expect(phases[0].name).toBe('Base')
    expect(db.select().from(planWeeks).all()).toHaveLength(1)
    const sessions = db.select().from(planSessions).all()
    expect(sessions).toHaveLength(3)
    expect(sessions.map(s => s.status).sort()).toEqual(['completed', 'planned', 'skipped'])
  })
})
