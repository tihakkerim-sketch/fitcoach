import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestDb, type TestDb } from './testDb'
import { createPlan, updatePlan } from './planWrite'
import { getPlanToday, listPlans, getPlanDetail } from './planRead'

let db: TestDb

// Start Mo 05.10.2026, 2 Wochen (bis So 18.10.), Einheiten Di + Do in Woche 0, Di in Woche 1
function seed() {
  return createPlan(db, {
    name: 'Plan', startDate: '2026-10-05',
    weeks: [
      { sessions: [{ dayOfWeek: 2, type: 'running' }, { dayOfWeek: 4, type: 'running' }] },
      { sessions: [{ dayOfWeek: 2, type: 'running' }] },
    ],
  }, 1_800_000_000_000)
}

beforeEach(async () => { db = await makeTestDb() })

describe('listPlans / getPlanDetail', () => {
  it('liefert weekCount und die neueste zuerst', () => {
    const a = seed()
    const b = createPlan(db, { name: 'Neuer', startDate: '2026-10-12', weeks: [{ sessions: [] }] }, 1_800_000_001_000)
    const list = listPlans(db)
    expect(list.map(p => p.id)).toEqual([b.id, a.id])
    expect(list.map(p => p.weekCount)).toEqual([1, 2])
  })

  it('gibt null für einen unbekannten Plan', () => {
    expect(getPlanDetail(db, 42)).toBeNull()
  })

  it('sortiert Einheiten nach Wochentag und ID', () => {
    const plan = createPlan(db, {
      name: 'P', startDate: '2026-10-05',
      weeks: [{ sessions: [{ dayOfWeek: 5, type: 'running' }, { dayOfWeek: 1, type: 'rest' }] }],
    })
    expect(getPlanDetail(db, plan.id)!.weeks[0].sessions.map(s => s.dayOfWeek)).toEqual([1, 5])
  })
})

describe('getPlanToday', () => {
  it('none ohne aktiven Plan', () => {
    const r = getPlanToday(db, '2026-10-11')
    expect(r.state).toBe('none')
    expect(r.plan).toBeNull()
  })

  it('before vor dem Start', () => {
    seed()
    const r = getPlanToday(db, '2026-10-04')
    expect(r.state).toBe('before')
    expect(r.todaySessions).toEqual([])
    expect(r.weekSessions).toEqual([])
    expect(r.weekIndex).toBeNull()
  })

  it('running: nur Einheiten mit heutigem Datum in todaySessions', () => {
    seed()
    const r = getPlanToday(db, '2026-10-06') // Di Woche 0
    expect(r.state).toBe('running')
    expect(r.weekIndex).toBe(0)
    expect(r.weekSessions).toHaveLength(2)
    expect(r.todaySessions.map(s => s.date)).toEqual(['2026-10-06'])
    expect(getPlanToday(db, '2026-10-07').todaySessions).toEqual([]) // Mi: frei
    expect(getPlanToday(db, '2026-10-13').weekIndex).toBe(1)
  })

  it('finished nach dem Ende', () => {
    seed()
    const r = getPlanToday(db, '2026-10-19')
    expect(r.state).toBe('finished')
    expect(r.plan?.id).toBeDefined()
  })

  it('beachtet verlängerte Wochenzahl', () => {
    const p = seed()
    updatePlan(db, { planId: p.id, weekCount: 3 })
    expect(getPlanToday(db, '2026-10-19').state).toBe('running')
  })
})
