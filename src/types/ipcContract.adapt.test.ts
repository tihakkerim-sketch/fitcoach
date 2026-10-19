import { describe, it, expect } from 'vitest'
import { IPC } from './ipc'
import { ipcInputs } from './ipcContract'

const ok = (ch: keyof typeof ipcInputs, v: unknown) => ipcInputs[ch].safeParse(v).success

describe('Plan-Anpassung: Eingaben', () => {
  it('Feedback: Anstrengung 1–10 oder null', () => {
    const base = { activityId: 1, pain: false, notes: null, skipped: false }
    expect(ok(IPC.ADAPT_FEEDBACK, { ...base, effort: 10 })).toBe(true)
    expect(ok(IPC.ADAPT_FEEDBACK, { ...base, effort: null })).toBe(true)
    expect(ok(IPC.ADAPT_FEEDBACK, { ...base, effort: 11 })).toBe(false)
    expect(ok(IPC.ADAPT_FEEDBACK, { ...base, effort: 5, notes: 'x'.repeat(2001) })).toBe(false)
  })
  it('Nicht 100 %: Grund und 1–7 Tage', () => {
    expect(ok(IPC.ADAPT_NOT_FULL, { reason: 'sick', days: 7 })).toBe(true)
    expect(ok(IPC.ADAPT_NOT_FULL, { reason: 'sick', days: 8 })).toBe(false)
    expect(ok(IPC.ADAPT_NOT_FULL, { reason: 'tired', days: 2 })).toBe(false)
  })
  it('Leistung: nur 5 / 10 / 21,0975 km, Zeit 10 min – 4 h', () => {
    expect(ok(IPC.ADAPT_SET_PERFORMANCE, { distanceKm: 21.0975, timeSec: 6000 })).toBe(true)
    expect(ok(IPC.ADAPT_SET_PERFORMANCE, { distanceKm: 7, timeSec: 2000 })).toBe(false)
    expect(ok(IPC.ADAPT_SET_PERFORMANCE, { distanceKm: 10, timeSec: 500 })).toBe(false)
  })
  it('Übernehmen/Ablehnen brauchen eine id', () => {
    expect(ok(IPC.ADAPT_APPLY, { id: 3 })).toBe(true)
    expect(ok(IPC.ADAPT_REJECT, {})).toBe(false)
  })
})
