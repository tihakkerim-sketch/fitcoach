import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestDb, type TestDb } from './testDb'
import { insertActivity, runCadenceSpm } from './activityInsert'

let db: TestDb
const act = (over: Record<string, unknown> = {}) =>
  ({ type: 'running', date: '2026-10-10', source: 'manual', distanceKm: 10, ...over }) as never

beforeEach(async () => { db = await makeTestDb() })

describe('runCadenceSpm', () => {
  it('verdoppelt halbe Lauf-Kadenz', () => { expect(runCadenceSpm('running', 67)).toBe(134) })
  it('lässt normale Lauf-Kadenz unverändert', () => { expect(runCadenceSpm('running', 170)).toBe(170) })
  it('gibt ohne Kadenz null zurück', () => {
    expect(runCadenceSpm('running', undefined)).toBeNull()
    expect(runCadenceSpm('running', null)).toBeNull()
  })
  it('lässt Rad-Kadenz unverändert', () => { expect(runCadenceSpm('cycling', 30)).toBe(30) })
})

describe('insertActivity Kadenz', () => {
  it('speichert Lauf mit 67 als 134', () => {
    expect(insertActivity(db, act({ avgCadence: 67 })).avgCadence).toBe(134)
  })
  it('speichert Lauf mit 170 unverändert', () => {
    expect(insertActivity(db, act({ avgCadence: 170 })).avgCadence).toBe(170)
  })
  it('speichert Lauf ohne Kadenz als null', () => {
    expect(insertActivity(db, act()).avgCadence).toBeNull()
  })
  it('speichert Rad mit 30 unverändert', () => {
    expect(insertActivity(db, act({ type: 'cycling', avgCadence: 30 })).avgCadence).toBe(30)
  })
})
