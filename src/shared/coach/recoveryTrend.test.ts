import { describe, expect, it } from 'vitest'
import { recoveryTrend } from './recoveryTrend'

const TODAY = '2026-10-11'

describe('recoveryTrend', () => {
  it('7- und 30-Tage-Fenster, HRV-Abweichung', () => {
    const logs = [
      { date: '2026-10-11', hrvRmssd: 40, restingHr: 52, sleepHours: 7 },
      { date: '2026-10-08', hrvRmssd: 50, restingHr: 50, sleepHours: 8 },
      { date: '2026-10-05', hrvRmssd: 60, restingHr: 48, sleepHours: 6 }, // außerhalb 7 Tage (−6 = 10-05 zählt)
      { date: '2026-10-04', hrvRmssd: 70, restingHr: 46, sleepHours: 9 }, // nur 30 Tage
      { date: '2026-09-12', hrvRmssd: 80, restingHr: 44, sleepHours: 7.5 }, // −29 → zählt
      { date: '2026-09-11', hrvRmssd: 999, restingHr: 99, sleepHours: 1 }, // außerhalb
    ]
    const r = recoveryTrend(logs, TODAY)
    expect(r.hrvToday).toBe(40)
    expect(r.hrv7).toBe(50) // (40+50+60)/3
    expect(r.hrv30).toBe(60) // (40+50+60+70+80)/5
    expect(r.hrvDeltaPct).toBe(-33)
    expect(r.rhr7).toBe(50)
    expect(r.rhr30).toBe(48)
    expect(r.sleep7).toBe(7)
    expect(r.sleep30).toBe(7.5)
  })
  it('fehlende Werte → null', () => {
    const r = recoveryTrend([{ date: '2026-10-10', hrvRmssd: 55 }], TODAY)
    expect(r.hrvToday).toBeNull()
    expect(r.hrvDeltaPct).toBeNull()
    expect(r.hrv7).toBe(55)
    expect(r.sleep7).toBeNull()
    expect(recoveryTrend([], TODAY).hrv30).toBeNull()
  })
})
