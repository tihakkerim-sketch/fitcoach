import { describe, it, expect } from 'vitest'
import { notFullProposal } from './notFull'
import type { AdaptInput, AdaptSession } from './types'

const TODAY = '2026-10-19'

const s = (id: number, date: string, over: Partial<AdaptSession> = {}): AdaptSession => ({
  id, date, type: 'running', title: null, targetDistanceKm: 10, targetDurationMin: null,
  targetPaceFastSec: null, targetPaceSlowSec: null, targetHrZone: 2, hasSteps: false, status: 'planned', ...over,
})
const hard = (id: number, date: string) => s(id, date, { targetHrZone: 4 })

const input = (sessions: AdaptSession[], over: Partial<AdaptInput> = {}): AdaptInput => ({
  today: TODAY, planEnd: '2026-11-30', sessions, recent: [], recoveryBad: false, avgWeekKmPrev28: 40, ...over,
})

const ids = (r: ReturnType<typeof notFullProposal>) => r.changes.map(c => (c.action === 'update' ? c.sessionId : -1))

describe('notFullProposal', () => {
  it('sick 3 days → rest days, then next 2 sessions easy −30 %', () => {
    const i = input([s(1, TODAY), hard(2, '2026-10-20'), s(3, '2026-10-22'), hard(4, '2026-10-23'), s(5, '2026-10-25')])
    const r = notFullProposal(i, 'sick', 3)
    expect(ids(r)).toEqual([1, 2, 3, 4])
    expect(r.changes[0]).toMatchObject({ set: { type: 'rest' } })
    expect(r.changes[1]).toMatchObject({ set: { type: 'rest' } })
    expect(r.changes[2]).toEqual({ action: 'update', sessionId: 3, set: { targetHrZone: 2, steps: null, targetDistanceKm: 7 } })
    expect(r.changes[3]).toEqual({ action: 'update', sessionId: 4, set: { targetHrZone: 2, steps: null, targetDistanceKm: 7 } })
    expect(r.reasons.every(x => x.rule === 'NOT_FULL')).toBe(true)
  })

  it('pain 2 days → hard easy ×0.7, easy −30 %, next hard after the period easy', () => {
    const i = input([hard(1, TODAY), s(2, '2026-10-20'), s(3, '2026-10-22'), hard(4, '2026-10-23')])
    const r = notFullProposal(i, 'pain', 2)
    expect(r.changes).toEqual([
      { action: 'update', sessionId: 1, set: { targetHrZone: 2, steps: null, targetDistanceKm: 7 } },
      { action: 'update', sessionId: 2, set: { targetDistanceKm: 7 } },
      { action: 'update', sessionId: 4, set: { targetHrZone: 2, steps: null, targetDistanceKm: 10 } },
    ])
  })

  it('busy keeps hard sessions hard, only shorter', () => {
    const r = notFullProposal(input([hard(1, TODAY)]), 'busy', 1)
    expect(r.changes).toEqual([{ action: 'update', sessionId: 1, set: { targetDistanceKm: 7 } }])
  })

  it('"after" sessions are capped at planEnd', () => {
    const r = notFullProposal(input([s(1, TODAY), s(2, '2026-10-21')], { planEnd: '2026-10-20' }), 'sick', 1)
    expect(ids(r)).toEqual([1])
  })

  it('caps at 10 changes', () => {
    const sessions = Array.from({ length: 14 }, (_, n) => s(n + 1, `2026-10-${String(19 + Math.floor(n / 2)).padStart(2, '0')}`))
    expect(notFullProposal(input(sessions), 'busy', 7).changes).toHaveLength(10)
  })
})
