import { describe, it, expect, beforeEach } from 'vitest'
import { activities, hrZones, recoveryLogs, userProfile } from '../../db/schema'
import { makeTestDb, type TestDb } from './testDb'
import { addDaysStr } from '../../src/shared/planCalendar'
import { createPlan } from './planWrite'
import { getCoachStatus, loadHrBasics } from './coachData'

// Plan ab Mo 2026-10-05; heute Mi 2026-10-14
const TODAY = '2026-10-14'
let db: TestDb

const addRun = (date: string, km: number, min: number, extra: Partial<typeof activities.$inferInsert> = {}) =>
  db.insert(activities).values({
    type: 'running', date, createdAt: 1, source: 'manual', distanceKm: km, durationMin: min, ...extra,
  }).run()

beforeEach(async () => { db = await makeTestDb() })

describe('getCoachStatus', () => {
  it('leere DB liefert Status ohne Absturz', () => {
    const s = getCoachStatus(db, TODAY)
    expect(s.hr).toBeNull()
    expect(s.zonesSource).toBe('none')
    expect(s.prognosis).toBeNull()
  })

  it('Max-Puls aus Läufen, Ruhepuls aus Recovery; Zonen berechnet', () => {
    addRun('2026-10-10', 10, 60, { avgHr: 150, maxHr: 182 })
    addRun('2026-10-12', 5, 30, { avgHr: 140, maxHr: 175 })
    db.insert(recoveryLogs).values({ date: '2026-10-13', restingHr: 52, createdAt: 1, updatedAt: 1 }).run()
    const s = getCoachStatus(db, TODAY)
    expect(s.hr).toMatchObject({ maxHr: 182, restHr: 52, maxSource: 'observed', restSource: 'recovery' })
    expect(s.zonesSource).toBe('computed')
    expect(loadHrBasics(db, TODAY)?.maxHr).toBe(182)
  })

  it('gespeicherte Zonen und Profil haben Vorrang', () => {
    db.insert(userProfile).values({ id: 1, maxHr: 190, restingHr: 50 }).run()
    db.insert(hrZones).values({ zoneNumber: 1, minHr: 100, maxHr: 120, label: 'Z1' }).run()
    const s = getCoachStatus(db, TODAY)
    expect(s.zonesSource).toBe('saved')
    expect(s.hr?.maxSource).toBe('profile')
  })

  it('Plan der nächsten 7 Tage zählt nur geplante Läufe; Ziel aus Plan', () => {
    createPlan(db, {
      name: 'P', goalEvent: 'Halbmarathon', startDate: '2026-10-05',
      weeks: [
        { sessions: [{ dayOfWeek: 2, type: 'running', targetDistanceKm: 99 }] }, // 06.10. vergangen
        { sessions: [
          { dayOfWeek: 3, type: 'running', targetDistanceKm: 7 }, // 14.10. = heute, zählt nicht
          { dayOfWeek: 4, type: 'running', targetDistanceKm: 8 }, // 15.10.
          { dayOfWeek: 6, type: 'cycling', targetDistanceKm: 30 }, // kein Lauf
        ] },
        { sessions: [{ dayOfWeek: 2, type: 'running', targetDistanceKm: 10 }] }, // 20.10.
        { sessions: [{ dayOfWeek: 3, type: 'running', targetDistanceKm: 50 }] }, // 28.10. zu spät
      ],
    })
    // 4 Wochen Läufe für die Warnung "geplante Woche"
    for (let i = 1; i <= 28; i += 7) addRun(addDaysStr('2026-09-09', i), 20, 120)
    const s = getCoachStatus(db, TODAY)
    expect(s.ramp.plannedNext7Km).toBe(18) // 8 + 10
    addRun('2026-10-01', 21, 110)
    expect(getCoachStatus(db, TODAY).prognosis?.targetLabel).toBe('Halbmarathon')
  })
})
