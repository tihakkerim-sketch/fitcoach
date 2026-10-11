import { describe, expect, it } from 'vitest'
import { formatDuration, goalDistance, parseGoalTime, predictRace, riegel } from './prognosis'
import type { CoachActivity } from './types'

const run = (date: string, km: number, min: number): CoachActivity => ({
  date, type: 'running', durationMin: min, distanceKm: km, avgHr: null, perceivedEffort: null,
})
const TODAY = '2026-10-11'
const MARATHON = { km: 42.195, label: 'Marathon' }

describe('riegel', () => {
  it('10 km in 50 min → Marathon 3:50:01', () => {
    const t = riegel(3000, 10, 42.195)
    expect(t).toBeCloseTo(3000 * Math.pow(4.2195, 1.06), 6)
    expect(formatDuration(t)).toBe('3:50:01')
  })
})

describe('parseGoalTime', () => {
  it('Varianten', () => {
    expect(parseGoalTime('4:00')).toBe(14400)
    expect(parseGoalTime('3:59:30')).toBe(3 * 3600 + 59 * 60 + 30)
    expect(parseGoalTime('4h')).toBe(14400)
    expect(parseGoalTime('4 h')).toBe(14400)
    expect(parseGoalTime('4h 10m')).toBe(4 * 3600 + 600)
    expect(parseGoalTime('3:45:00 h')).toBe(3 * 3600 + 45 * 60)
    expect(parseGoalTime('sub 4')).toBe(14400)
  })
  it('ungültig → null', () => {
    expect(parseGoalTime('')).toBeNull()
    expect(parseGoalTime(null)).toBeNull()
    expect(parseGoalTime('schnell')).toBeNull()
    expect(parseGoalTime('4:75')).toBeNull()
  })
})

describe('goalDistance', () => {
  it('erkennt Distanzen', () => {
    expect(goalDistance('Wien Marathon')).toEqual({ km: 42.195, label: 'Marathon' })
    expect(goalDistance('Halbmarathon Graz')).toEqual({ km: 21.0975, label: 'Halbmarathon' })
    expect(goalDistance('Half Marathon')).toEqual({ km: 21.0975, label: 'Halbmarathon' })
    expect(goalDistance('Stadtlauf HM')).toEqual({ km: 21.0975, label: 'Halbmarathon' })
    expect(goalDistance('10 km Lauf')).toEqual({ km: 10, label: '10 km' })
    expect(goalDistance('Parkrun 5k')).toEqual({ km: 5, label: '5 km' })
    expect(goalDistance(null)).toEqual({ km: 42.195, label: 'Marathon' })
  })
})

describe('formatDuration', () => {
  it('h:mm:ss', () => {
    expect(formatDuration(14292)).toBe('3:58:12')
    expect(formatDuration(65)).toBe('0:01:05')
  })
})

describe('predictRace', () => {
  it('wählt die schnellste Vorhersage, Status nach Ziel', () => {
    const acts = [run('2026-10-01', 10, 50), run('2026-09-20', 8, 48), run('2026-10-05', 3, 10)]
    const p = predictRace(acts, TODAY, MARATHON, 4 * 3600)!
    expect(p.basedOn).toEqual({ date: '2026-10-01', distanceKm: 10, durationSec: 3000 })
    expect(p.predictedSec).toBe(Math.round(riegel(3000, 10, 42.195)))
    expect(p.status).toBe('onTrack')
    expect(p.requiredPaceSec).toBe(341)
    expect(p.predictedPaceSec).toBe(Math.round(p.predictedSec / 42.195))
  })
  it('Status close / offTrack / noGoal', () => {
    const acts = [run('2026-10-01', 10, 50)]
    const pred = Math.round(riegel(3000, 10, 42.195))
    expect(predictRace(acts, TODAY, MARATHON, Math.round(pred / 1.03))!.status).toBe('close')
    expect(predictRace(acts, TODAY, MARATHON, Math.round(pred / 1.2))!.status).toBe('offTrack')
    const n = predictRace(acts, TODAY, MARATHON, null)!
    expect(n.status).toBe('noGoal')
    expect(n.requiredPaceSec).toBeNull()
  })
  it('ignoriert kurze, alte und andere Aktivitäten', () => {
    expect(predictRace([run('2026-10-01', 4, 20)], TODAY, MARATHON, null)).toBeNull()
    expect(predictRace([run('2026-07-01', 10, 50)], TODAY, MARATHON, null)).toBeNull()
    expect(predictRace([{ ...run('2026-10-01', 10, 50), type: 'cycling' }], TODAY, MARATHON, null)).toBeNull()
    expect(predictRace([run('2026-07-20', 10, 50)], TODAY, MARATHON, null)).not.toBeNull() // genau 83 Tage
  })
})
