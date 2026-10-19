import { describe, it, expect } from 'vitest'
import { applyGuards } from './guards'
import { easyVersion, isHard } from './sessions'
import type { AdaptInput, AdaptSession } from './types'

const TODAY = '2026-10-19' // Montag

const s = (id: number, date: string, over: Partial<AdaptSession> = {}): AdaptSession => ({
  id, date, type: 'running', title: null, targetDistanceKm: 10, targetDurationMin: null,
  targetPaceFastSec: null, targetPaceSlowSec: null, targetHrZone: 2, hasSteps: false, status: 'planned', ...over,
})

const input = (sessions: AdaptSession[], over: Partial<AdaptInput> = {}): AdaptInput => ({
  today: TODAY, planEnd: '2026-11-30', sessions, recent: [], recoveryBad: false, avgWeekKmPrev28: 30, ...over,
})

const OPTS = { maxChanges: 5, unlimitedReduction: false }

describe('sessions', () => {
  it('isHard: zone 3 or steps', () => {
    expect(isHard(s(1, TODAY, { targetHrZone: 3 }))).toBe(true)
    expect(isHard(s(1, TODAY, { hasSteps: true }))).toBe(true)
    expect(isHard(s(1, TODAY, { targetHrZone: 2 }))).toBe(false)
  })
  it('easyVersion(0.7) of 10 km → 7 km, zone 2, no steps', () => {
    expect(easyVersion(s(1, TODAY, { targetHrZone: 4, hasSteps: true }), 0.7)).toEqual({
      action: 'update', sessionId: 1, set: { targetHrZone: 2, steps: null, targetDistanceKm: 7 },
    })
  })
})

describe('applyGuards', () => {
  it('drops change on completed session (and its reason)', () => {
    const i = input([s(1, TODAY, { status: 'completed' }), s(2, '2026-10-20')])
    const r = applyGuards(i, {
      changes: [easyVersion(i.sessions[0], 0.9), easyVersion(i.sessions[1], 0.9)],
      reasons: [{ sessionId: 1, rule: 'R2', text: 'a' }, { sessionId: 2, rule: 'R2', text: 'b' }],
    }, OPTS)
    expect(r.changes).toEqual([easyVersion(i.sessions[1], 0.9)])
    expect(r.reasons.map(x => x.text)).toEqual(['b'])
  })

  it('drops change on past session', () => {
    const i = input([s(1, '2026-10-18')])
    expect(applyGuards(i, { changes: [easyVersion(i.sessions[0], 0.9)], reasons: [] }, OPTS).changes).toEqual([])
  })

  it('drops move beyond planEnd', () => {
    const i = input([s(1, '2026-10-25')], { planEnd: '2026-10-25' })
    expect(applyGuards(i, { changes: [{ action: 'move', sessionId: 1, date: '2026-10-26' }], reasons: [] }, OPTS).changes).toEqual([])
  })

  it('drops move creating back-to-back hard days', () => {
    const i = input([s(1, '2026-10-20', { targetHrZone: 4 }), s(2, '2026-10-22', { targetHrZone: 4 })])
    expect(applyGuards(i, { changes: [{ action: 'move', sessionId: 1, date: '2026-10-21' }], reasons: [] }, OPTS).changes).toEqual([])
  })

  it('keeps shortening a hard session that already had a hard neighbour', () => {
    const i = input([s(1, '2026-10-20', { targetHrZone: 4 }), s(2, '2026-10-21', { targetHrZone: 4 })])
    const ch = { action: 'update' as const, sessionId: 1, set: { targetDistanceKm: 9 } }
    expect(applyGuards(i, { changes: [ch], reasons: [] }, OPTS).changes).toEqual([ch])
  })

  it('keeps move to a day without hard neighbours', () => {
    const i = input([s(1, '2026-10-20', { targetHrZone: 4 }), s(2, '2026-10-23', { targetHrZone: 4 })])
    const ch = { action: 'move' as const, sessionId: 1, date: '2026-10-21' }
    expect(applyGuards(i, { changes: [ch], reasons: [] }, OPTS).changes).toEqual([ch])
  })

  it('drops +15 % window volume; keeps −30 % only with unlimitedReduction', () => {
    const i = input([s(1, '2026-10-20'), s(2, '2026-10-22')]) // 20 km im Fenster
    const up = { action: 'update' as const, sessionId: 1, set: { targetDistanceKm: 13 } } // +3 km = +15 %
    expect(applyGuards(i, { changes: [up], reasons: [] }, OPTS).changes).toEqual([])
    const down = { action: 'update' as const, sessionId: 1, set: { targetDistanceKm: 4 } } // −6 km = −30 %
    expect(applyGuards(i, { changes: [down], reasons: [] }, OPTS).changes).toEqual([])
    expect(applyGuards(i, { changes: [down], reasons: [] }, { ...OPTS, unlimitedReduction: true }).changes).toEqual([down])
  })

  it('cuts to maxChanges keeping the first ones', () => {
    const i = input([1, 2, 3].map(n => s(n, `2026-10-2${n}`)))
    const changes = i.sessions.map(x => easyVersion(x, 1))
    expect(applyGuards(i, { changes, reasons: [] }, { ...OPTS, maxChanges: 2 }).changes).toEqual(changes.slice(0, 2))
  })
})
