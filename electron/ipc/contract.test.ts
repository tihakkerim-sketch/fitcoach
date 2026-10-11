import { describe, it, expect } from 'vitest'
import { IPC } from '../../src/types/ipc'
import { ipcInputs, MAX_GARMIN_FILE_BYTES } from '../../src/types/ipcContract'

const ok = (channel: keyof typeof ipcInputs, input: unknown) => ipcInputs[channel].safeParse(input).success

describe('IPC contract', () => {
  it('has a schema for every channel', () => {
    for (const channel of Object.values(IPC)) expect(ipcInputs[channel]).toBeDefined()
  })

  describe('activities:create', () => {
    const base = { type: 'running', date: '2026-10-10', source: 'manual', durationMin: 45, distanceKm: 8.2, avgHr: 150 }
    it('accepts a valid run', () => expect(ok(IPC.ACTIVITIES_CREATE, base)).toBe(true))
    it('rejects bad date, HR out of range, negative distance, unknown type', () => {
      expect(ok(IPC.ACTIVITIES_CREATE, { ...base, date: '10.10.2026' })).toBe(false)
      expect(ok(IPC.ACTIVITIES_CREATE, { ...base, date: '2026-13-01' })).toBe(false)
      expect(ok(IPC.ACTIVITIES_CREATE, { ...base, avgHr: 10 })).toBe(false)
      expect(ok(IPC.ACTIVITIES_CREATE, { ...base, distanceKm: -1 })).toBe(false)
      expect(ok(IPC.ACTIVITIES_CREATE, { ...base, type: 'swimming' })).toBe(false)
    })
    it('rejects overly long notes', () => {
      expect(ok(IPC.ACTIVITIES_CREATE, { ...base, notes: 'x'.repeat(2001) })).toBe(false)
    })
  })

  describe('recovery:upsert', () => {
    it('accepts valid values and optional fields', () => {
      expect(ok(IPC.RECOVERY_LOG_UPSERT, { date: '2026-10-10' })).toBe(true)
      expect(ok(IPC.RECOVERY_LOG_UPSERT, { date: '2026-10-10', bodyBattery: 80, sleepScore: 77, hrvRmssd: 55.5, restingHr: 48 })).toBe(true)
    })
    it('rejects out-of-range values and a client-supplied readiness score is dropped', () => {
      expect(ok(IPC.RECOVERY_LOG_UPSERT, { date: '2026-10-10', bodyBattery: 101 })).toBe(false)
      expect(ok(IPC.RECOVERY_LOG_UPSERT, { date: '2026-10-10', restingHr: 5 })).toBe(false)
      const parsed = ipcInputs[IPC.RECOVERY_LOG_UPSERT].parse({ date: '2026-10-10', readinessScore: 99 })
      expect(parsed).not.toHaveProperty('readinessScore')
    })
  })

  describe('plans:create / plans:adapt', () => {
    const plan = {
      name: 'Marathon',
      goalDate: '2027-04-18',
      phases: [{
        name: 'Base', orderIndex: 0, durationWeeks: 1,
        weeks: [{ weekNumber: 1, sessions: [{ dayOfWeek: 2, type: 'running', targetDurationMin: 45, targetHrZone: 2 }] }],
      }],
    }
    it('accepts a valid plan (null optionals from imports too)', () => {
      expect(ok(IPC.PLANS_CREATE, plan)).toBe(true)
      const withNull = structuredClone(plan)
      ;(withNull.phases[0].weeks[0].sessions[0] as Record<string, unknown>).intensityLabel = null
      expect(ok(IPC.PLANS_CREATE, withNull)).toBe(true)
    })
    it('rejects weekday 0 or 8, HR zone 6, empty phases', () => {
      for (const dayOfWeek of [0, 8]) {
        const p = structuredClone(plan); p.phases[0].weeks[0].sessions[0].dayOfWeek = dayOfWeek
        expect(ok(IPC.PLANS_CREATE, p)).toBe(false)
      }
      const z = structuredClone(plan); z.phases[0].weeks[0].sessions[0].targetHrZone = 6
      expect(ok(IPC.PLANS_CREATE, z)).toBe(false)
      expect(ok(IPC.PLANS_CREATE, { ...plan, phases: [] })).toBe(false)
    })
    it('adapt needs a positive integer planId', () => {
      expect(ok(IPC.PLANS_ADAPT, { ...plan, planId: 3 })).toBe(true)
      expect(ok(IPC.PLANS_ADAPT, { ...plan, planId: 0 })).toBe(false)
      expect(ok(IPC.PLANS_ADAPT, plan)).toBe(false)
    })
  })

  describe('garmin:parse', () => {
    it('accepts a Uint8Array within the size limit', () => {
      expect(ok(IPC.GARMIN_PARSE, { fileName: 'run.fit', data: new Uint8Array(1024) })).toBe(true)
    })
    it('rejects plain arrays and missing file names', () => {
      expect(ok(IPC.GARMIN_PARSE, { fileName: 'run.fit', data: [1, 2, 3] })).toBe(false)
      expect(ok(IPC.GARMIN_PARSE, { fileName: '', data: new Uint8Array(1) })).toBe(false)
    })
    it('rejects files above 50 MB', () => {
      expect(ok(IPC.GARMIN_PARSE, { fileName: 'big.fit', data: new Uint8Array(MAX_GARMIN_FILE_BYTES + 1) })).toBe(false)
    })
  })

  it('ids must be positive integers', () => {
    for (const bad of [0, -1, 1.5, '1', null]) expect(ok(IPC.ACTIVITIES_DELETE, bad)).toBe(false)
    expect(ok(IPC.ACTIVITIES_DELETE, 7)).toBe(true)
  })
})
