import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb, type TestDb } from './testDb'
import { activities, recoveryLogs, planSessions, planWeeks, trainingPlans } from '../../db/schema'
import { runIntervalsSync, runIntervalsSyncShared } from './intervalsSync'
import { saveImported } from './importActivity'
import { IntervalsError, type IcuActivity, type IcuWellness, type IntervalsClient } from './intervalsClient'
import { getSetting, setSetting, deleteSetting } from './appSettings'
import type { ParsedActivity } from './garminParse'

let db: TestDb

const TCX = (start: string) => Buffer.from(`<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities>
<Activity Sport="Running"><Id>${start}</Id><Lap StartTime="${start}"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters>
<AverageHeartRateBpm><Value>140</Value></AverageHeartRateBpm></Lap></Activity></Activities></TrainingCenterDatabase>`)

interface Fake extends IntervalsClient {
  listActivities: ReturnType<typeof vi.fn>
  downloadOriginal: ReturnType<typeof vi.fn>
  listWellness: ReturnType<typeof vi.fn>
}
function fake(acts: IcuActivity[], files: Record<string, Buffer | null> = {}, wellness: IcuWellness[] = []): Fake {
  return {
    getAthlete: vi.fn(),
    listActivities: vi.fn(async () => acts),
    downloadOriginal: vi.fn(async (id: string) => files[id] ?? null),
    listWellness: vi.fn(async () => wellness),
  } as unknown as Fake
}
const NOW = new Date(2026, 9, 11, 12, 0, 0) // 11.10.2026 lokal
const act = (over: Partial<IcuActivity> = {}): IcuActivity => ({
  id: 'i1', start_date_local: '2026-10-10T07:30:00', type: 'Run', name: 'Morgenlauf',
  distance: 5000, moving_time: 1750, elapsed_time: 1800, ...over,
})

beforeEach(async () => { db = await makeTestDb() })

describe('Zeitraum', () => {
  it('first sync: today - 30 days (local dates)', async () => {
    const c = fake([])
    const r = await runIntervalsSync(db, c, { now: NOW })
    expect(c.listActivities).toHaveBeenCalledWith('2026-09-11', '2026-10-11')
    expect(c.listWellness).toHaveBeenCalledWith('2026-09-11', '2026-10-11')
    expect(r).toMatchObject({ from: '2026-09-11', to: '2026-10-11', at: NOW.getTime() })
  })
  it('follow-up sync: last sync - 2 days', async () => {
    const c = fake([])
    const last = new Date(2026, 9, 9, 8, 0, 0).getTime()
    await runIntervalsSync(db, c, { now: NOW, lastSyncAt: last })
    expect(c.listActivities).toHaveBeenCalledWith('2026-10-07', '2026-10-11')
  })
})

describe('Aktivitäten', () => {
  it('imports from original file; start_date_local wins', async () => {
    const c = fake([act()], { i1: TCX('2026-10-10T05:00:00Z') })
    const r = await runIntervalsSync(db, c, { now: NOW })
    expect(r.created).toBe(1)
    const a = db.select().from(activities).get()!
    expect(a).toMatchObject({ externalId: 'icu:i1', source: 'intervals_icu', date: '2026-10-10', startTime: '07:30', type: 'running' })
    expect(a.distanceKm).toBeCloseTo(5, 1)
  })

  it('known external id: no download, counted as duplicate', async () => {
    const c = fake([act()], { i1: TCX('2026-10-10T05:00:00Z') })
    await runIntervalsSync(db, c, { now: NOW })
    c.downloadOriginal.mockClear()
    const r = await runIntervalsSync(db, c, { now: NOW })
    expect(c.downloadOriginal).not.toHaveBeenCalled()
    expect(r).toMatchObject({ created: 0, duplicates: 1 })
    expect(db.select().from(activities).all()).toHaveLength(1)
  })

  it('duplicate of a run already imported from a file (same time/distance)', async () => {
    const existing: ParsedActivity = {
      activity: { type: 'running', date: '2026-10-10', startTime: '07:31', distanceKm: 5.0, durationMin: 30 },
      samples: [],
    }
    saveImported(db, existing, { fileName: 'a.tcx', source: 'garmin_import' })
    const r = await runIntervalsSync(db, fake([act()], { i1: TCX('2026-10-10T05:30:00Z') }), { now: NOW })
    expect(r).toMatchObject({ created: 0, duplicates: 1 })
    expect(db.select().from(activities).all()).toHaveLength(1)
  })

  it('fallback from summary fields without file (type mapping, hr range)', async () => {
    const c = fake([
      act({ id: 'i2', type: 'VirtualRide', average_heartrate: 130, max_heartrate: 10, total_elevation_gain: 80.4, start_date_local: '2026-10-09T18:00:00' }),
      act({ id: 'i3', type: 'Yoga', start_date_local: '2026-10-08T18:00:00' }),
    ])
    const r = await runIntervalsSync(db, c, { now: NOW })
    expect(r.created).toBe(2)
    const rows = db.select().from(activities).all()
    const ride = rows.find(x => x.externalId === 'icu:i2')!
    expect(ride).toMatchObject({ type: 'cycling', avgHr: 130, maxHr: null, elevationGainM: 80, durationMin: 30, movingTimeMin: 29.2, distanceKm: 5 })
    expect(rows.find(x => x.externalId === 'icu:i3')).toMatchObject({ type: 'custom', typeLabel: 'Yoga' })
  })

  it('Strava stub without fields counts as unavailable, nothing saved', async () => {
    const r = await runIntervalsSync(db, fake([{ id: 'i9', source: 'STRAVA' }, act({ id: 'i8', elapsed_time: null, moving_time: null })]), { now: NOW })
    expect(r).toMatchObject({ created: 0, unavailable: 2, errors: [] })
    expect(db.select().from(activities).all()).toHaveLength(0)
  })

  it('broken file falls back to summary; failing item goes to errors, rest continues', async () => {
    const parse = vi.fn(async (b: Buffer): Promise<ParsedActivity> => {
      if (b.toString() === 'broken') throw new Error('kaputt')
      return { activity: { type: 'running', date: '2026-10-10', startTime: '07:00', distanceKm: 3, durationMin: 20 }, samples: [] }
    })
    const c = fake([act({ id: 'a' }), act({ id: 'b', start_date_local: '2026-10-05T07:00:00' }), act({ id: 'c', start_date_local: '2026-10-06T07:00:00' })],
      { a: Buffer.from('broken'), b: Buffer.from('ok'), c: Buffer.from('ok') })
    const orig = c.downloadOriginal.getMockImplementation()!
    c.downloadOriginal.mockImplementation(async (id: string) => {
      if (id === 'c') throw new IntervalsError('http', 'Fehler 500', 500)
      return orig(id)
    })
    const r = await runIntervalsSync(db, c, { now: NOW, parseOriginal: parse })
    expect(r.created).toBe(2) // a (Summen-Fallback), b (Datei)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain('c')
  })

  it('rate limit and auth errors abort the whole sync', async () => {
    const c = fake([act({ id: 'a' }), act({ id: 'b' })])
    c.downloadOriginal.mockRejectedValue(new IntervalsError('rate', 'Zu viele Anfragen', 429))
    await expect(runIntervalsSync(db, c, { now: NOW })).rejects.toMatchObject({ kind: 'rate' })
    const c2 = fake([])
    c2.listActivities.mockRejectedValue(new IntervalsError('auth', 'API-Schlüssel ungültig', 401))
    await expect(runIntervalsSync(db, c2, { now: NOW })).rejects.toMatchObject({ kind: 'auth' })
  })

  it('auto-matches the plan session of that day', async () => {
    db.insert(trainingPlans).values({ id: 1, name: 'P', startDate: '2026-10-05', isActive: 1, createdAt: 1 }).run()
    db.insert(planWeeks).values({ id: 1, planId: 1, weekIndex: 0 }).run()
    db.insert(planSessions).values({ id: 1, weekId: 1, dayOfWeek: 6, type: 'running' }).run() // Sa 10.10.
    const r = await runIntervalsSync(db, fake([act()], { i1: TCX('2026-10-10T05:30:00Z') }), { now: NOW })
    expect(r.created).toBe(1)
    const s = db.select().from(planSessions).where(eq(planSessions.id, 1)).get()!
    expect(s).toMatchObject({ status: 'completed', matchSource: 'auto' })
  })
})

describe('Wellness', () => {
  const day = (over: Partial<IcuWellness> = {}): IcuWellness => ({ id: '2026-10-10', hrv: 62.4, restingHR: 48, sleepSecs: 27000, sleepScore: 81.6, ...over })

  it('creates a new row with source intervals_icu and readiness', async () => {
    const r = await runIntervalsSync(db, fake([], {}, [day()]), { now: NOW })
    expect(r.recoveryDays).toBe(1)
    const row = db.select().from(recoveryLogs).get()!
    expect(row).toMatchObject({ date: '2026-10-10', hrvRmssd: 62.4, restingHr: 48, sleepScore: 82, sleepHours: 7.5, source: 'intervals_icu' })
    expect(row.readinessScore).not.toBeNull()
  })

  it('fills only empty fields, never overwrites manual values, recomputes readiness', async () => {
    db.insert(recoveryLogs).values({ date: '2026-10-10', hrvRmssd: 40, bodyBattery: 70, source: 'manual', createdAt: 1, updatedAt: 1, readinessScore: 1 }).run()
    const r = await runIntervalsSync(db, fake([], {}, [day()]), { now: NOW })
    expect(r.recoveryDays).toBe(1)
    const row = db.select().from(recoveryLogs).get()!
    expect(row).toMatchObject({ hrvRmssd: 40, bodyBattery: 70, restingHr: 48, sleepScore: 82, sleepHours: 7.5, source: 'manual' })
    expect(row.readinessScore).not.toBe(1)
  })

  it('does not count unchanged days; ignores empty or invalid days', async () => {
    db.insert(recoveryLogs).values({ date: '2026-10-10', hrvRmssd: 40, restingHr: 50, sleepScore: 70, sleepHours: 8, source: 'manual', createdAt: 1, updatedAt: 1 }).run()
    const r = await runIntervalsSync(db, fake([], {}, [day(), { id: '2026-10-09' }, { id: 'kaputt', hrv: 50 }]), { now: NOW })
    expect(r.recoveryDays).toBe(0)
    expect(db.select().from(recoveryLogs).all()).toHaveLength(1)
  })

  it('non-fatal wellness failure is reported, activities stay', async () => {
    const c = fake([act()])
    c.listWellness.mockRejectedValue(new IntervalsError('http', 'Fehler 500', 500))
    const r = await runIntervalsSync(db, c, { now: NOW })
    expect(r.created).toBe(1)
    expect(r.errors[0]).toContain('Recovery-Werte')
  })
})

describe('Nebenläufigkeit', () => {
  it('shared wrapper reuses the running sync', async () => {
    const c = fake([])
    const p1 = runIntervalsSyncShared(db, c, { now: NOW })
    const p2 = runIntervalsSyncShared(db, c, { now: NOW })
    expect(p2).toBe(p1)
    await p1
    expect(c.listActivities).toHaveBeenCalledTimes(1)
    await runIntervalsSyncShared(db, c, { now: NOW })
    expect(c.listActivities).toHaveBeenCalledTimes(2)
  })
})

describe('appSettings', () => {
  it('get/set/delete', () => {
    expect(getSetting(db, 'k')).toBeNull()
    setSetting(db, 'k', 'a'); setSetting(db, 'k', 'b')
    expect(getSetting(db, 'k')).toBe('b')
    deleteSetting(db, 'k')
    expect(getSetting(db, 'k')).toBeNull()
  })
})
