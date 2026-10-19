import { describe, it, expect } from 'vitest'
import { riegel } from '../coach/prognosis'
import { paceCheck, scalePaces, to10kSec } from './pace'
import type { AdaptSession, RunFeedback } from './types'

const TODAY = '2026-10-19'

// Tempo-Einheit: Ziel 300 s/km; q = paceSec / 300
const hardRun = (date: string, paceSec: number, effort: number | null, over: Partial<RunFeedback> = {}): RunFeedback => ({
  activityId: 1, date, sessionId: 1, sessionHard: true, effort, pain: false, avgHr: 160, zoneMinHr: 150,
  zoneMaxHr: 170, paceSec, targetPaceFastSec: 300, distanceKm: 8, ...over,
})

const s = (id: number, date: string, over: Partial<AdaptSession> = {}): AdaptSession => ({
  id, date, type: 'running', title: null, targetDistanceKm: 8, targetDurationMin: null,
  targetPaceFastSec: 300, targetPaceSlowSec: 310, targetHrZone: 4, hasSteps: false, status: 'planned', ...over,
})

describe('to10kSec', () => {
  it('converts 5 km 25:00 via Riegel', () => {
    expect(to10kSec(1500, 5)).toBe(Math.round(riegel(1500, 5, 10)))
  })
  it('keeps a 10 km time', () => {
    expect(to10kSec(3000, 10)).toBe(3000)
  })
})

describe('paceCheck', () => {
  it('missing without performance', () => {
    expect(paceCheck([hardRun('2026-10-15', 280, 5)], null, null, TODAY)).toMatchObject({ state: 'missing', new10kSec: null })
  })

  it('observing with only one valid session', () => {
    expect(paceCheck([hardRun('2026-10-15', 280, 5)], 3000, null, TODAY)).toMatchObject({ state: 'observing', used: 1 })
  })

  it('ignores outlier q 0.8 (GPS) and easy runs without pace target', () => {
    const recent = [
      hardRun('2026-10-10', 240, 5), // q 0.8 → Ausreißer
      hardRun('2026-10-12', 280, 5, { sessionHard: false }),
      hardRun('2026-10-15', 280, 5, { targetPaceFastSec: null }),
      hardRun('2026-10-17', 280, 5),
    ]
    expect(paceCheck(recent, 3000, null, TODAY)).toMatchObject({ state: 'observing', used: 1 })
  })

  it('faster: 2 of 3 fast and easy → new10k = round(current × 0.98)', () => {
    const recent = [hardRun('2026-10-08', 300, 6), hardRun('2026-10-12', 288, 5), hardRun('2026-10-16', 285, 6)]
    expect(paceCheck(recent, 3001, null, TODAY)).toEqual({ state: 'faster', used: 3, current10kSec: 3001, new10kSec: Math.round(3001 * 0.98) })
  })

  it('fast but hard does not count as faster', () => {
    const recent = [hardRun('2026-10-12', 288, 8), hardRun('2026-10-16', 285, 8)]
    expect(paceCheck(recent, 3000, null, TODAY).state).toBe('ok')
  })

  it('slower: 2 of 3 slow and hard → new10k = round(current × 1.02)', () => {
    const recent = [hardRun('2026-10-12', 315, 8), hardRun('2026-10-16', 320, 7)]
    expect(paceCheck(recent, 3000, null, TODAY)).toMatchObject({ state: 'slower', new10kSec: 3060 })
  })

  it('mixed: one faster, one slower', () => {
    const recent = [hardRun('2026-10-12', 288, 5), hardRun('2026-10-16', 315, 8)]
    expect(paceCheck(recent, 3000, null, TODAY).state).toBe('mixed')
  })

  it('ignores sessions on or before `since` and older than 28 days', () => {
    const recent = [hardRun('2026-09-20', 288, 5), hardRun('2026-10-10', 288, 5), hardRun('2026-10-16', 288, 5)]
    expect(paceCheck(recent, 3000, '2026-10-10', TODAY)).toMatchObject({ state: 'observing', used: 1 })
  })
})

describe('scalePaces', () => {
  it('scales fast/slow of planned sessions from today, skips past and completed', () => {
    const sessions = [
      s(1, '2026-10-18'), s(2, TODAY, { status: 'completed' }), s(3, '2026-10-21'),
      s(4, '2026-10-23', { targetPaceFastSec: null, targetPaceSlowSec: null }),
    ]
    const r = scalePaces(sessions, TODAY, 0.98)
    expect(r.changes).toEqual([{ action: 'update', sessionId: 3, set: { targetPaceFastSec: 294, targetPaceSlowSec: 304 } }])
    expect(r.reasons).toEqual([{ rule: 'PACE', text: expect.stringMatching(/2 % schneller/) }])
  })
})
