import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb, type TestDb } from './testDb'
import { activities, activitySplits, activityStreams, planSessions, planWeeks, trainingPlans } from '../../db/schema'
import { saveImported } from './importActivity'
import type { ParsedActivity, Sample } from './garminParse'

let db: TestDb

/** 3,2 km in 16 Minuten, jede Sekunde ein Punkt. */
function run(date = '2026-10-12', startTime = '07:00'): ParsedActivity {
  const samples: Sample[] = []
  for (let t = 0; t <= 960; t++) samples.push({ tSec: t, distKm: (t / 960) * 3.2, hr: 150, altM: 200 + (t > 480 ? 10 : 0) })
  return {
    activity: { type: 'running', date, startTime, source: 'garmin_import', durationMin: 16, distanceKm: 3.2, avgHr: 150 },
    samples,
  }
}

beforeEach(async () => { db = await makeTestDb() })

describe('saveImported', () => {
  it('creates activity, splits and streams', () => {
    const r = saveImported(db, run(), { fileName: 'a.tcx', source: 'garmin_import' })
    expect(r.status).toBe('created')
    const act = db.select().from(activities).where(eq(activities.id, r.activityId)).get()!
    expect(act).toMatchObject({ source: 'garmin_import', garminFileName: 'a.tcx', distanceKm: 3.2 })
    const splits = db.select().from(activitySplits).where(eq(activitySplits.activityId, r.activityId)).all()
    expect(splits.map(s => s.splitIndex)).toEqual([1, 2, 3, 4]) // 3 volle + Rest 0,2 km
    expect(splits[3].distanceKm).toBeCloseTo(0.2, 3)
    const streams = db.select().from(activityStreams).where(eq(activityStreams.activityId, r.activityId)).get()!
    const data = JSON.parse(streams.data)
    expect(data.t.length).toBe(500)
    expect(data.t[0]).toBe(0)
  })

  it('stores external id and given source (intervals_icu)', () => {
    const r = saveImported(db, run(), { externalId: 'icu:i1', source: 'intervals_icu' })
    const act = db.select().from(activities).where(eq(activities.id, r.activityId)).get()!
    expect(act).toMatchObject({ externalId: 'icu:i1', source: 'intervals_icu' })
  })

  it('second import of the same run is a duplicate and writes nothing', () => {
    const first = saveImported(db, run(), { fileName: 'a.tcx', source: 'garmin_import' })
    const second = saveImported(db, run(), { fileName: 'a.tcx', source: 'garmin_import' })
    expect(second).toEqual({ status: 'duplicate', activityId: first.activityId })
    expect(db.select().from(activities).all()).toHaveLength(1)
    expect(db.select().from(activitySplits).all()).toHaveLength(4)
  })

  it('duplicate via external id', () => {
    const first = saveImported(db, run('2026-10-12', '07:00'), { externalId: 'icu:i1', source: 'intervals_icu' })
    const other = run('2026-10-13', '18:00')
    expect(saveImported(db, other, { externalId: 'icu:i1', source: 'intervals_icu' }))
      .toEqual({ status: 'duplicate', activityId: first.activityId })
  })

  it('without samples: activity only, no splits/streams', () => {
    const p = run(); p.samples = []
    const r = saveImported(db, p, { source: 'garmin_import' })
    expect(r.status).toBe('created')
    expect(db.select().from(activitySplits).all()).toHaveLength(0)
    expect(db.select().from(activityStreams).all()).toHaveLength(0)
  })

  it('auto-matches the run to the planned session of that day', () => {
    // Plan startet Montag 2026-10-12, Einheit Di (dayOfWeek 2) = 2026-10-13
    db.insert(trainingPlans).values({ id: 1, name: 'P', startDate: '2026-10-12', isActive: 1, createdAt: 1 }).run()
    db.insert(planWeeks).values({ id: 1, planId: 1, weekIndex: 0 }).run()
    db.insert(planSessions).values({ id: 1, weekId: 1, dayOfWeek: 2, type: 'running' }).run()
    const r = saveImported(db, run('2026-10-13'), { source: 'garmin_import' })
    const s = db.select().from(planSessions).where(eq(planSessions.id, 1)).get()!
    expect(s).toMatchObject({ status: 'completed', linkedActivityId: r.activityId, matchSource: 'auto' })
  })

  it('rolls back everything when a later step fails', () => {
    db.$client.exec('DROP TABLE activity_streams') // Folgeschritt kaputt machen
    expect(() => saveImported(db, run(), { source: 'garmin_import' })).toThrow()
    expect(db.select().from(activities).all()).toHaveLength(0)
    expect(db.select().from(activitySplits).all()).toHaveLength(0)
  })

  it('throws without a date', () => {
    expect(() => saveImported(db, { activity: { type: 'running' }, samples: [] }, { source: 'garmin_import' })).toThrow(/Datum/)
  })
})
