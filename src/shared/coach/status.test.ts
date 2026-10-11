import { describe, expect, it } from 'vitest'
import { addDaysStr } from '../planCalendar'
import { buildCoachStatus } from './status'
import type { CoachActivity } from './types'

const TODAY = '2026-10-11'

describe('buildCoachStatus', () => {
  it('Smoke-Test mit Profil, Läufen und Recovery', () => {
    const acts: CoachActivity[] = []
    for (let i = 0; i < 60; i += 2) {
      acts.push({
        date: addDaysStr(TODAY, -i), type: 'running', durationMin: 50, distanceKm: 9, avgHr: 150, perceivedEffort: null,
      })
    }
    const s = buildCoachStatus({
      today: TODAY,
      activities: acts,
      savedZones: [],
      profile: { maxHr: 190, restingHr: 50, goalEvent: 'Marathon', goalFinishTime: '4:00' },
      recoveryLogs: [{ date: TODAY, hrvRmssd: 50, restingHr: 50, sleepHours: 7 }],
      plannedNext7Km: 30,
    })
    expect(s.series).toHaveLength(90)
    expect(s.current).toEqual(s.series[89])
    expect(s.current!.ctl).toBeGreaterThan(0)
    expect(s.form).not.toBeNull()
    expect(s.zonesSource).toBe('computed')
    expect(s.zones).toHaveLength(5)
    expect(s.prognosis?.targetLabel).toBe('Marathon')
    expect(s.prognosis?.goalSec).toBe(14400)
    expect(s.recovery.hrvToday).toBe(50)
  })
  it('Override der Zieldistanz und leere Daten', () => {
    const s = buildCoachStatus({
      today: TODAY, activities: [], savedZones: [], profile: null, recoveryLogs: [],
      plannedNext7Km: null, goalEventOverride: '10 km',
    })
    expect(s.hr).toBeNull()
    expect(s.zonesSource).toBe('none')
    expect(s.prognosis).toBeNull()
    expect(s.series).toHaveLength(90)
    expect(s.current!.ctl).toBe(0)
  })
  it('beobachteter Max-Puls und Recovery-Ruhepuls als Fallback', () => {
    const s = buildCoachStatus({
      today: TODAY, activities: [], savedZones: [], profile: null,
      recoveryLogs: [{ date: TODAY, restingHr: 54 }], plannedNext7Km: null, observedMaxHr: 192,
    })
    expect(s.hr).toMatchObject({ maxHr: 192, restHr: 54, maxSource: 'observed', restSource: 'recovery' })
  })
})
