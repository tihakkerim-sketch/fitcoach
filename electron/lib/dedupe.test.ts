import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestDb, type TestDb } from './testDb'
import { activities } from '../../db/schema'
import { findDuplicate } from './dedupe'

let db: TestDb

function add(v: Partial<typeof activities.$inferInsert> & { date: string }): number {
  const [row] = db.insert(activities).values({ type: 'running', createdAt: 1, source: 'manual', ...v }).returning().all()
  return row.id
}

beforeEach(async () => { db = await makeTestDb() })

describe('findDuplicate', () => {
  it('finds the same external_id, even on another day', () => {
    const id = add({ date: '2026-10-01', externalId: 'icu:i1' })
    expect(findDuplicate(db, { externalId: 'icu:i1', date: '2026-10-05', type: 'running' })).toBe(id)
    expect(findDuplicate(db, { externalId: 'icu:i2', date: '2026-10-05', type: 'running' })).toBeNull()
  })

  it('same day + start within 2 min + distance within 3 %', () => {
    const id = add({ date: '2026-10-10', startTime: '07:30', distanceKm: 10 })
    const cand = { date: '2026-10-10', type: 'running', startTime: '07:32', distanceKm: 10.29 }
    expect(findDuplicate(db, cand)).toBe(id)
    expect(findDuplicate(db, { ...cand, startTime: '07:28' })).toBe(id)
    expect(findDuplicate(db, { ...cand, startTime: '07:33' })).toBeNull()      // 3 Min
    expect(findDuplicate(db, { ...cand, distanceKm: 10.4 })).toBeNull()        // > 3 %
    expect(findDuplicate(db, { ...cand, date: '2026-10-11' })).toBeNull()
  })

  it('without distance on both sides compares duration within 3 %', () => {
    const id = add({ date: '2026-10-10', startTime: '18:00', durationMin: 60, type: 'strength' })
    const cand = { date: '2026-10-10', type: 'strength', startTime: '18:01', durationMin: 61 }
    expect(findDuplicate(db, cand)).toBe(id)
    expect(findDuplicate(db, { ...cand, durationMin: 70 })).toBeNull()
  })

  it('same start but nothing comparable is not a duplicate', () => {
    add({ date: '2026-10-10', startTime: '18:00' })
    expect(findDuplicate(db, { date: '2026-10-10', type: 'running', startTime: '18:00' })).toBeNull()
  })

  it('distance mismatch with start match does not fall through to the loose rule', () => {
    add({ date: '2026-10-10', startTime: '07:30', distanceKm: 5 })
    expect(findDuplicate(db, { date: '2026-10-10', type: 'running', startTime: '07:30', distanceKm: 10 })).toBeNull()
  })

  it('without start time: same day + type + distance within 3 %', () => {
    const id = add({ date: '2026-10-10', distanceKm: 8 })
    expect(findDuplicate(db, { date: '2026-10-10', type: 'running', distanceKm: 8.2 })).toBe(id)
    expect(findDuplicate(db, { date: '2026-10-10', type: 'cycling', distanceKm: 8.2 })).toBeNull()
    expect(findDuplicate(db, { date: '2026-10-10', type: 'running', distanceKm: 9 })).toBeNull()
    expect(findDuplicate(db, { date: '2026-10-10', type: 'running' })).toBeNull()
  })

  it('a manual entry without start time still matches an import with start time (same distance)', () => {
    const id = add({ date: '2026-10-10', distanceKm: 8 })
    expect(findDuplicate(db, { date: '2026-10-10', type: 'running', startTime: '07:00', distanceKm: 8.1 })).toBe(id)
  })

  it('two different runs on the same day are both allowed', () => {
    add({ date: '2026-10-10', startTime: '07:00', distanceKm: 8 })
    expect(findDuplicate(db, { date: '2026-10-10', type: 'running', startTime: '18:00', distanceKm: 8 })).toBeNull()
  })
})
