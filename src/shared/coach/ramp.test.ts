import { describe, expect, it } from 'vitest'
import { acwrWarning, rampInfo } from './ramp'
import type { CoachActivity } from './types'

const run = (date: string, km: number, type = 'running'): CoachActivity => ({
  date, type, durationMin: km * 6, distanceKm: km, avgHr: null, perceivedEffort: null,
})
const TODAY = '2026-10-11'
// 4 Wochen á 12 km (je ein Lauf pro Woche) vor den letzten 7 Tagen
const base = ['2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'].map(d => run(d, 12))

describe('rampInfo', () => {
  it('warnt bei Steigerung (Woche, längster Lauf, Plan)', () => {
    const r = rampInfo([...base, run('2026-10-08', 16)], TODAY, 14)
    expect(r.avgWeekKmPrev28).toBe(12)
    expect(r.last7Km).toBe(16)
    expect(r.longestPrev28Km).toBe(12)
    const byKind = Object.fromEntries(r.warnings.map(w => [w.kind, w]))
    expect(byKind.weeklyKm.level).toBe('warn')
    expect(byKind.weeklyKm.percent).toBe(33)
    expect(byKind.weeklyKm.text).toContain('Letzte 7 Tage 16 km = +33 %')
    expect(byKind.longRun.level).toBe('warn')
    expect(byKind.plannedWeek.level).toBe('info')
    expect(byKind.plannedWeek.percent).toBe(17)
  })
  it('keine Warnung bei kleiner Steigerung', () => {
    expect(rampInfo([...base, run('2026-10-08', 12.5)], TODAY, null).warnings).toEqual([])
  })
  it('Schutz: zu wenig Basis-km', () => {
    const small = ['2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'].map(d => run(d, 5))
    expect(rampInfo([...small, run('2026-10-08', 15)], TODAY, 40).warnings).toEqual([])
  })
  it('Schutz: weniger als 3 Wochen mit Läufen', () => {
    const few = [run('2026-09-24', 20), run('2026-10-01', 20)]
    expect(rampInfo([...few, run('2026-10-08', 30)], TODAY, null).warnings).toEqual([])
  })
  it('zählt nur Läufe', () => {
    const r = rampInfo([...base, run('2026-10-08', 30, 'cycling')], TODAY, null)
    expect(r.last7Km).toBe(0)
  })
})

describe('acwrWarning', () => {
  it('warnt ab Verhältnis > 1,5', () => {
    const w = acwrWarning(40, 64)
    expect(w?.kind).toBe('acwr')
    expect(w?.percent).toBe(60)
    expect(w?.text).toContain('1,6×')
  })
  it('keine Warnung bei niedrigem CTL oder normalem Verhältnis', () => {
    expect(acwrWarning(5, 20)).toBeNull()
    expect(acwrWarning(40, 50)).toBeNull()
  })
})
