import { describe, expect, it } from 'vitest'
import { activityTrimp, FORM_TEXT, formLevel, loadSeries } from './load'
import type { CoachActivity, HrBasics } from './types'

const hr: HrBasics = { maxHr: 190, restHr: 50, maxSource: 'profile', restSource: 'profile' }
const run = (date: string, over: Partial<CoachActivity> = {}): CoachActivity => ({
  date, type: 'running', durationMin: 60, distanceKm: 10, avgHr: 150, perceivedEffort: null, ...over,
})

describe('activityTrimp', () => {
  it('60 min bei Ø-Puls 150 (190/50)', () => {
    const hrr = 100 / 140
    const expected = Math.round(60 * hrr * 0.64 * Math.exp(1.92 * hrr) * 10) / 10
    expect(activityTrimp(run('2026-10-01'), hr)).toBe(expected)
    expect(expected).toBeGreaterThan(107)
    expect(expected).toBeLessThan(110)
  })
  it('RPE-Schätzung ohne Puls', () => {
    const hrr = 0.35 + 0.05 * 6
    const expected = Math.round(60 * hrr * 0.64 * Math.exp(1.92 * hrr) * 10) / 10
    expect(activityTrimp(run('2026-10-01', { avgHr: null, perceivedEffort: 6 }), hr)).toBe(expected)
    expect(activityTrimp(run('2026-10-01'), null)).toBe(
      activityTrimp(run('2026-10-01', { avgHr: null, perceivedEffort: null }), hr),
    )
  })
  it('Standard-HRR 0,6 ohne alles', () => {
    const expected = Math.round(60 * 0.6 * 0.64 * Math.exp(1.92 * 0.6) * 10) / 10
    expect(activityTrimp(run('2026-10-01', { avgHr: null }), hr)).toBe(expected)
  })
  it('Schlaf und fehlende Dauer = 0, HRR wird begrenzt', () => {
    expect(activityTrimp(run('2026-10-01', { type: 'sleep' }), hr)).toBe(0)
    expect(activityTrimp(run('2026-10-01', { durationMin: null }), hr)).toBe(0)
    expect(activityTrimp(run('2026-10-01', { avgHr: 250 }), hr)).toBe(
      activityTrimp(run('2026-10-01', { avgHr: 190 }), hr),
    )
    expect(activityTrimp(run('2026-10-01', { avgHr: 30 }), hr)).toBe(0)
  })
})

describe('loadSeries', () => {
  it('ein Punkt pro Tag, inklusive Grenzen', () => {
    const s = loadSeries([], hr, '2026-10-01', '2026-10-10')
    expect(s).toHaveLength(10)
    expect(s[0].date).toBe('2026-10-01')
    expect(s[9].date).toBe('2026-10-10')
    expect(s.every(p => p.ctl === 0 && p.tsb === 0)).toBe(true)
  })
  it('konstante Tageslast konvergiert gegen die Last', () => {
    const acts: CoachActivity[] = []
    const from = '2026-01-01'
    const s0 = loadSeries([], hr, from, '2026-12-31')
    const load = activityTrimp(run('x'), hr)
    for (const p of s0) acts.push(run(p.date))
    const s = loadSeries(acts, hr, from, '2026-12-31')
    const last = s[s.length - 1]
    expect(last.ctl).toBeCloseTo(load, 0)
    expect(last.atl).toBeCloseTo(load, 0)
    expect(Math.abs(last.tsb)).toBeLessThan(0.5)
  })
  it('TSB nutzt die Werte von gestern', () => {
    const load = activityTrimp(run('x'), hr)
    const s = loadSeries([run('2026-10-01')], hr, '2026-10-01', '2026-10-03')
    expect(s[0].tsb).toBe(0)
    expect(s[0].load).toBe(load)
    expect(s[1].tsb).toBeCloseTo(s[0].ctl - s[0].atl, 0)
    expect(s[1].tsb).toBeLessThan(0)
  })
})

describe('formLevel', () => {
  it('Schwellen', () => {
    expect(formLevel(6)).toBe('fresh')
    expect(formLevel(5)).toBe('neutral')
    expect(formLevel(-10)).toBe('neutral')
    expect(formLevel(-10.1)).toBe('building')
    expect(formLevel(-30)).toBe('building')
    expect(formLevel(-31)).toBe('overload')
    expect(FORM_TEXT.overload).toBe('Überlastungsgefahr')
  })
})
