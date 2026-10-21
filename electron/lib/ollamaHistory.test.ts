import { describe, it, expect } from 'vitest'
import { parseStoredHistory, appendHistory, markHistoryApplied } from './ollamaHistory'
import type { LocalCoachResult } from '../../src/types/ipc'

const mk = (n: number, extra: Partial<LocalCoachResult> = {}): LocalCoachResult => ({
  answer: { explanation: `Antwort ${n}`, fitcoachChanges: { fitcoachChanges: 1, summary: 's', changes: [] } },
  model: 'qwen3:8b',
  createdAt: `2026-10-${String(10 + n).padStart(2, '0')}T10:00:00.000Z`,
  dateFrom: '2026-10-01',
  dateTo: '2026-10-20',
  ...extra,
})

describe('parseStoredHistory', () => {
  it('returns [] for null, empty, corrupt or non-array JSON', () => {
    expect(parseStoredHistory(null)).toEqual([])
    expect(parseStoredHistory('')).toEqual([])
    expect(parseStoredHistory('{kaputt')).toEqual([])
    expect(parseStoredHistory('{"a":1}')).toEqual([])
  })
  it('keeps valid entries and drops invalid ones individually', () => {
    const raw = JSON.stringify([mk(1), { foo: 1 }, null, 'x', mk(2, { message: 'Hi', followUp: true })])
    expect(parseStoredHistory(raw)).toEqual([mk(1), mk(2, { message: 'Hi', followUp: true })])
  })
})

describe('appendHistory', () => {
  it('prepends the new result', () => {
    expect(appendHistory([mk(1)], mk(2))).toEqual([mk(2), mk(1)])
  })
  it('caps at max (default 10), dropping the oldest', () => {
    const h = Array.from({ length: 10 }, (_, i) => mk(i))
    const out = appendHistory(h, mk(20))
    expect(out).toHaveLength(10)
    expect(out[0]).toEqual(mk(20))
    expect(out[9]).toEqual(mk(8))
    expect(appendHistory([mk(1), mk(2)], mk(3), 2)).toEqual([mk(3), mk(1)])
  })
  it('does not mutate the input', () => {
    const h = [mk(1)]
    appendHistory(h, mk(2))
    expect(h).toEqual([mk(1)])
  })
})

describe('markHistoryApplied', () => {
  it('sets appliedAt only on the entry with that createdAt', () => {
    const h = [mk(2), mk(1)]
    const out = markHistoryApplied(h, mk(1).createdAt, '2026-10-21T08:00:00.000Z')
    expect(out[0]).toEqual(mk(2))
    expect(out[1]).toEqual({ ...mk(1), appliedAt: '2026-10-21T08:00:00.000Z' })
  })
  it('leaves history unchanged if nothing matches', () => {
    expect(markHistoryApplied([mk(1)], 'nope', 'x')).toEqual([mk(1)])
  })
})
