import { describe, it, expect } from 'vitest'
import { adaptAfterRun } from './rules'
import type { AdaptInput, AdaptSession, RunFeedback } from './types'

const TODAY = '2026-10-19' // Montag

const s = (id: number, date: string, over: Partial<AdaptSession> = {}): AdaptSession => ({
  id, date, type: 'running', title: null, targetDistanceKm: 8, targetDurationMin: null,
  targetPaceFastSec: null, targetPaceSlowSec: null, targetHrZone: 2, hasSteps: false, status: 'planned', ...over,
})
const hard = (id: number, date: string, over: Partial<AdaptSession> = {}) => s(id, date, { targetHrZone: 4, ...over })

const run = (over: Partial<RunFeedback> = {}): RunFeedback => ({
  activityId: 1, date: TODAY, sessionId: 100, sessionHard: false, effort: 5, pain: false,
  avgHr: 140, zoneMinHr: 120, zoneMaxHr: 150, paceSec: 360, targetPaceFastSec: null, distanceKm: 8, ...over,
})

const input = (sessions: AdaptSession[], over: Partial<AdaptInput> = {}): AdaptInput => ({
  today: TODAY, planEnd: '2026-11-30', sessions, recent: [], recoveryBad: false, avgWeekKmPrev28: 40, ...over,
})

describe('adaptAfterRun', () => {
  it('no trigger → empty result', () => {
    const r = adaptAfterRun(input([hard(2, '2026-10-21')]), run())
    expect(r).toEqual({ changes: [], reasons: [] })
  })

  it('R1 pain → hard tomorrow becomes rest day', () => {
    const r = adaptAfterRun(input([hard(2, '2026-10-20')]), run({ pain: true }))
    expect(r.changes).toEqual([{ action: 'update', sessionId: 2, set: expect.objectContaining({ type: 'rest', targetDistanceKm: null }) }])
    expect(r.reasons[0]).toMatchObject({ sessionId: 2, rule: 'R1' })
  })

  it('R1 pain → hard today becomes easy ×0.7, hard in 3 days untouched', () => {
    const r = adaptAfterRun(input([hard(2, TODAY, { targetDistanceKm: 10 }), hard(3, '2026-10-22')]), run({ pain: true }))
    expect(r.changes).toEqual([{ action: 'update', sessionId: 2, set: { targetHrZone: 2, steps: null, targetDistanceKm: 7 } }])
  })

  it('R2 effort 8 on easy run → next hard session (in 3 days) −10 %', () => {
    const r = adaptAfterRun(input([s(2, '2026-10-20'), hard(3, '2026-10-22', { targetDistanceKm: 10 })]), run({ effort: 8 }))
    expect(r.changes).toEqual([{ action: 'update', sessionId: 3, set: { targetDistanceKm: 9 } }])
    expect(r.reasons[0].text).toMatch(/8\/10/)
  })

  it('R2 hr above zone, hard session tomorrow → moved +1 day', () => {
    const r = adaptAfterRun(input([hard(3, '2026-10-20')]), run({ avgHr: 158 }))
    expect(r.changes).toEqual([{ action: 'move', sessionId: 3, date: '2026-10-21' }])
  })

  it('R2 not triggered for effort 7 with hr in zone', () => {
    expect(adaptAfterRun(input([hard(3, '2026-10-22')]), run({ effort: 7 })).changes).toEqual([])
  })

  it('R2 not triggered when the run itself was a hard session', () => {
    expect(adaptAfterRun(input([hard(3, '2026-10-22')]), run({ effort: 9, sessionHard: true })).changes).toEqual([])
  })

  it('R3 recovery bad → hard tomorrow moved +1 day', () => {
    const r = adaptAfterRun(input([hard(3, '2026-10-20')], { recoveryBad: true }), run())
    expect(r.changes).toEqual([{ action: 'move', sessionId: 3, date: '2026-10-21' }])
    expect(r.reasons[0].rule).toBe('R3')
  })

  it('R3 recovery bad, next day blocked by hard → made easy instead', () => {
    const r = adaptAfterRun(input([hard(3, '2026-10-20'), hard(4, '2026-10-22')], { recoveryBad: true }), run())
    expect(r.changes).toEqual([{ action: 'update', sessionId: 3, set: { targetHrZone: 2, steps: null, targetDistanceKm: 8 } }])
  })

  const easyRuns = (over: Partial<RunFeedback> = {}) =>
    ['2026-10-14', '2026-10-16', TODAY].map((date, i) => run({ activityId: i + 1, date, effort: 4, avgHr: 135, ...over }))

  it('R4 three easy runs → longest run in window +10 %', () => {
    const sessions = [s(2, '2026-10-21', { targetDistanceKm: 8 }), s(3, '2026-10-25', { targetDistanceKm: 15 })]
    const r = adaptAfterRun(input(sessions, { recent: easyRuns() }), run({ effort: 4, avgHr: 135 }))
    expect(r.changes).toEqual([{ action: 'update', sessionId: 3, set: { targetDistanceKm: 16.5 } }])
    expect(r.reasons[0].rule).toBe('R4')
  })

  it('R4 blocked by ramp limit (window km would exceed 110 % of 4-week average)', () => {
    const sessions = [s(2, '2026-10-21', { targetDistanceKm: 8 }), s(3, '2026-10-25', { targetDistanceKm: 15 })]
    const r = adaptAfterRun(input(sessions, { recent: easyRuns(), avgWeekKmPrev28: 22 }), run({ effort: 4, avgHr: 135 }))
    expect(r.changes).toEqual([])
  })

  it('R4 not triggered when avgHr is missing', () => {
    const r = adaptAfterRun(input([s(3, '2026-10-25', { targetDistanceKm: 15 })], { recent: easyRuns({ avgHr: null }) }), run({ effort: 4, avgHr: null }))
    expect(r.changes).toEqual([])
  })

  it('R4 skipped when R2 fired', () => {
    const sessions = [hard(2, '2026-10-22', { targetDistanceKm: 10 }), s(3, '2026-10-25', { targetDistanceKm: 15 })]
    const r = adaptAfterRun(input(sessions, { recent: easyRuns() }), run({ effort: 8 }))
    expect(r.changes.map(c => c.action === 'update' && c.sessionId)).toEqual([2])
  })

  it('R1 also fires for pain on a run yesterday when the current run had none', () => {
    const recent = [run({ activityId: 7, date: '2026-10-18', pain: true }), run({ effort: 9 })]
    const r = adaptAfterRun(input([hard(2, '2026-10-20')], { recent }), run({ effort: 9 }))
    expect(r.changes[0]).toMatchObject({ sessionId: 2, set: { type: 'rest' } })
    expect(r.reasons[0].rule).toBe('R1')
  })

  it('R2 does not move onto a day that already has a session – shortens instead', () => {
    const r = adaptAfterRun(input([hard(3, '2026-10-20', { targetDistanceKm: 10 }), s(4, '2026-10-21')]), run({ effort: 8 }))
    expect(r.changes).toEqual([{ action: 'update', sessionId: 3, set: { targetDistanceKm: 9 } }])
  })

  it('R6 skipped session last week only adds a reason', () => {
    const r = adaptAfterRun(input([s(9, '2026-10-16', { status: 'skipped' })]), run())
    expect(r.changes).toEqual([])
    expect(r.reasons).toEqual([expect.objectContaining({ rule: 'R6' })])
  })
})
