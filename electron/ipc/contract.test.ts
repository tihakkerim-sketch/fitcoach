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
      startDate: '2026-10-12', // Montag
      weeks: [{
        phase: 'Grundlage',
        sessions: [{ dayOfWeek: 2, type: 'running', title: 'Locker', targetDistanceKm: 8, targetPaceFastSec: 360, targetPaceSlowSec: 380, targetHrZone: 2 }],
      }],
    }
    it('accepts a valid plan (null optionals from imports too)', () => {
      expect(ok(IPC.PLANS_CREATE, plan)).toBe(true)
      const withNull = structuredClone(plan)
      ;(withNull.weeks[0].sessions[0] as Record<string, unknown>).steps = null
      expect(ok(IPC.PLANS_CREATE, withNull)).toBe(true)
    })
    it('requires a Monday as start date', () => {
      expect(ok(IPC.PLANS_CREATE, { ...plan, startDate: '2026-10-13' })).toBe(false)
      expect(ok(IPC.PLANS_CREATE, { ...plan, startDate: '2026-10-12' })).toBe(true)
    })
    it('rejects weekday 0 or 8, HR zone 6, empty weeks', () => {
      for (const dayOfWeek of [0, 8]) {
        const p = structuredClone(plan); p.weeks[0].sessions[0].dayOfWeek = dayOfWeek
        expect(ok(IPC.PLANS_CREATE, p)).toBe(false)
      }
      const z = structuredClone(plan); z.weeks[0].sessions[0].targetHrZone = 6
      expect(ok(IPC.PLANS_CREATE, z)).toBe(false)
      expect(ok(IPC.PLANS_CREATE, { ...plan, weeks: [] })).toBe(false)
    })
    it('rejects a pace range where fast is slower than slow', () => {
      const p = structuredClone(plan)
      p.weeks[0].sessions[0].targetPaceFastSec = 350
      p.weeks[0].sessions[0].targetPaceSlowSec = 330
      expect(ok(IPC.PLANS_CREATE, p)).toBe(false)
    })
    it('validates interval steps', () => {
      const withSteps = (steps: unknown) => {
        const p = structuredClone(plan) as Record<string, any>
        p.weeks[0].sessions[0].steps = steps
        return p
      }
      expect(ok(IPC.PLANS_CREATE, withSteps([{ repeat: 6, steps: [{ kind: 'work', distanceM: 800 }] }]))).toBe(true)
      expect(ok(IPC.PLANS_CREATE, withSteps([{ repeat: 1, steps: [{ kind: 'work', distanceM: 800 }] }]))).toBe(false)
      expect(ok(IPC.PLANS_CREATE, withSteps([{ kind: 'sprint' }]))).toBe(false)
    })
    it('adapt needs a positive integer planId', () => {
      expect(ok(IPC.PLANS_ADAPT, { ...plan, planId: 3 })).toBe(true)
      expect(ok(IPC.PLANS_ADAPT, { ...plan, planId: 0 })).toBe(false)
      expect(ok(IPC.PLANS_ADAPT, plan)).toBe(false)
    })
  })

  describe('plans:createEmpty / plans:update / sessions', () => {
    it('createEmpty needs Monday and 1–52 weeks', () => {
      const base = { name: 'X', startDate: '2026-10-12', weekCount: 4 }
      expect(ok(IPC.PLANS_CREATE_EMPTY, base)).toBe(true)
      expect(ok(IPC.PLANS_CREATE_EMPTY, { ...base, weekCount: 0 })).toBe(false)
      expect(ok(IPC.PLANS_CREATE_EMPTY, { ...base, weekCount: 53 })).toBe(false)
      expect(ok(IPC.PLANS_CREATE_EMPTY, { ...base, startDate: '2026-10-14' })).toBe(false)
    })
    it('update accepts partial fields, but a Monday only', () => {
      expect(ok(IPC.PLANS_UPDATE, { planId: 1, weekCount: 8 })).toBe(true)
      expect(ok(IPC.PLANS_UPDATE, { planId: 1, startDate: '2026-10-13' })).toBe(false)
    })
    it('sessions:update is partial; sessions:create needs plan and week', () => {
      expect(ok(IPC.SESSIONS_UPDATE, { sessionId: 1, title: 'Neu' })).toBe(true)
      expect(ok(IPC.SESSIONS_CREATE, { planId: 1, weekIndex: 0, dayOfWeek: 1, type: 'rest' })).toBe(true)
      expect(ok(IPC.SESSIONS_CREATE, { planId: 1, dayOfWeek: 1, type: 'rest' })).toBe(false)
    })
  })

  describe('garmin:importFiles', () => {
    const file = (fileName: string, size = 1024) => ({ fileName, data: new Uint8Array(size) })
    it('accepts .fit/.tcx files in any case', () => {
      expect(ok(IPC.GARMIN_IMPORT_FILES, { files: [file('run.fit'), file('RUN.TCX')] })).toBe(true)
    })
    it('rejects other extensions, plain arrays, empty names and empty or oversized lists', () => {
      expect(ok(IPC.GARMIN_IMPORT_FILES, { files: [file('run.gpx')] })).toBe(false)
      expect(ok(IPC.GARMIN_IMPORT_FILES, { files: [{ fileName: 'run.fit', data: [1, 2, 3] }] })).toBe(false)
      expect(ok(IPC.GARMIN_IMPORT_FILES, { files: [file('')] })).toBe(false)
      expect(ok(IPC.GARMIN_IMPORT_FILES, { files: [] })).toBe(false)
      expect(ok(IPC.GARMIN_IMPORT_FILES, { files: Array.from({ length: 51 }, () => file('a.fit', 1)) })).toBe(false)
      expect(ok(IPC.GARMIN_IMPORT_FILES, { files: Array.from({ length: 50 }, () => file('a.fit', 1)) })).toBe(true)
    })
    it('rejects names above 260 chars and files above 50 MB', () => {
      expect(ok(IPC.GARMIN_IMPORT_FILES, { files: [file('a'.repeat(257) + '.fit')] })).toBe(false)
      expect(ok(IPC.GARMIN_IMPORT_FILES, { files: [file('big.fit', MAX_GARMIN_FILE_BYTES + 1)] })).toBe(false)
    })
  })

  describe('activities:details / new fields', () => {
    it('details needs an id', () => {
      expect(ok(IPC.ACTIVITIES_DETAILS, 3)).toBe(true)
      expect(ok(IPC.ACTIVITIES_DETAILS, 0)).toBe(false)
    })
    it('activities accept intervals_icu source and new fields', () => {
      expect(ok(IPC.ACTIVITIES_CREATE, { type: 'running', date: '2026-10-10', source: 'intervals_icu', elevationGainM: 120, elevationLossM: 118, movingTimeMin: 44.5, externalId: 'icu:i1' })).toBe(true)
    })
    it('recovery accepts sleepHours 0–24 only', () => {
      expect(ok(IPC.RECOVERY_LOG_UPSERT, { date: '2026-10-10', sleepHours: 7.5, source: 'intervals_icu' })).toBe(true)
      expect(ok(IPC.RECOVERY_LOG_UPSERT, { date: '2026-10-10', sleepHours: 25 })).toBe(false)
    })
  })

  describe('intervals:*', () => {
    it('setKey trims and needs 10-200 chars', () => {
      expect(ok(IPC.INTERVALS_SET_KEY, { apiKey: 'a'.repeat(10) })).toBe(true)
      expect(ok(IPC.INTERVALS_SET_KEY, { apiKey: '   short   ' })).toBe(false)
      expect(ok(IPC.INTERVALS_SET_KEY, { apiKey: 'a'.repeat(201) })).toBe(false)
      expect(ipcInputs[IPC.INTERVALS_SET_KEY].parse({ apiKey: '  abcdefghij  ' }).apiKey).toBe('abcdefghij')
    })
    it('status, clearKey, sync take no input', () => {
      for (const c of [IPC.INTERVALS_STATUS, IPC.INTERVALS_CLEAR_KEY, IPC.INTERVALS_SYNC]) {
        expect(ok(c, undefined)).toBe(true)
        expect(ok(c, { x: 1 })).toBe(false)
      }
    })
  })

  it('ids must be positive integers', () => {
    for (const bad of [0, -1, 1.5, '1', null]) expect(ok(IPC.ACTIVITIES_DELETE, bad)).toBe(false)
    expect(ok(IPC.ACTIVITIES_DELETE, 7)).toBe(true)
  })
})
