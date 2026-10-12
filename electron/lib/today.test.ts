import { describe, it, expect } from 'vitest'
import { userProfile } from '../../db/schema'
import { makeTestDb } from './testDb'
import { appToday, getDayStartHour } from './today'

describe('appToday', () => {
  it('ohne Profil gilt 4 Uhr', async () => {
    const db = await makeTestDb()
    expect(getDayStartHour(db)).toBe(4)
    expect(appToday(db, new Date(2026, 9, 12, 2, 0))).toBe('2026-10-11')
    expect(appToday(db, new Date(2026, 9, 12, 4, 0))).toBe('2026-10-12')
  })

  it('nutzt die Stunde aus dem Profil', async () => {
    const db = await makeTestDb()
    db.insert(userProfile).values({ id: 1, dayStartHour: 0 }).run()
    expect(appToday(db, new Date(2026, 9, 12, 0, 30))).toBe('2026-10-12')
    db.update(userProfile).set({ dayStartHour: 6 }).run()
    expect(appToday(db, new Date(2026, 9, 12, 5, 30))).toBe('2026-10-11')
  })
})
