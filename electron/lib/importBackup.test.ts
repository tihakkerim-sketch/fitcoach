import { describe, it, expect, beforeEach } from 'vitest'
import {
  activities, userProfile, hrZones, trainingPlans, planPhases, planWeeks, planSessions,
  habits, habitLogs, dailyCheckins, recoveryLogs, nutritionLogs, bodyMetrics,
  challengePool, dailyChallenges,
} from '../../db/schema'
import { importBackup, type Db } from './importBackup'
import { exportBackup, BACKUP_VERSION } from './backupFormat'
import { makeTestDb } from './testDb'

async function makeDb(): Promise<Db> {
  return makeTestDb()
}

// A valid activity row (all NOT NULL columns present).
function activity(id: number, date: string) {
  return { id, type: 'running', date, createdAt: 1_700_000_000_000, source: 'manual' as const }
}

describe('importBackup', () => {
  let db: Db

  beforeEach(async () => {
    db = await makeDb()
    // Seed the "current" data: an original profile + two logged activities.
    db.insert(userProfile).values({ id: 1, name: 'Original', theme: 'dark' } as never).run()
    db.insert(activities).values(activity(1, '2026-05-01') as never).run()
    db.insert(activities).values(activity(2, '2026-05-02') as never).run()
  })

  it('restores all original data when an inserted row violates a constraint', () => {
    // Backup parses fine and passes shape validation, but one activity row
    // has a NULL `type`, which violates NOT NULL and throws mid-insert.
    const malformedBackup: Record<string, unknown> = {
      version: 2,
      userProfile: [{ id: 1, name: 'Imported', theme: 'light' }],
      activities: [{ id: 9, type: null, date: '2026-05-09', createdAt: 1, source: 'manual' }],
    }

    const result = importBackup(db, malformedBackup)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/previous data was restored/i)

    // The two original activities must still be present...
    const rows = db.select().from(activities).all()
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.date).sort()).toEqual(['2026-05-01', '2026-05-02'])

    // ...and the profile must NOT have been overwritten by 'Imported'.
    const profile = db.select().from(userProfile).all()
    expect(profile).toHaveLength(1)
    expect(profile[0].name).toBe('Original')
    expect(profile[0].theme).toBe('dark')
  })

  it('rejects a malformed backup before deleting anything', () => {
    const badShape: Record<string, unknown> = {
      version: 2,
      activities: 'this should be an array, not a string',
    }

    const result = importBackup(db, badShape)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/malformed/i)

    // Nothing was touched — both original activities survive.
    expect(db.select().from(activities).all()).toHaveLength(2)
    expect(db.select().from(userProfile).all()[0].name).toBe('Original')
  })

  it('rejects an unrecognised version without touching data', () => {
    const result = importBackup(db, { version: 99, activities: [] })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/version/i)
    expect(db.select().from(activities).all()).toHaveLength(2)
  })

  it('replaces data on a valid backup', () => {
    const goodBackup: Record<string, unknown> = {
      version: 2,
      userProfile: [{ id: 1, name: 'Imported', theme: 'light' }],
      activities: [activity(50, '2026-06-01')],
    }

    const result = importBackup(db, goodBackup)

    expect(result.success).toBe(true)

    const rows = db.select().from(activities).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-06-01')

    const profile = db.select().from(userProfile).all()
    expect(profile[0].name).toBe('Imported')
    expect(profile[0].theme).toBe('light')
  })

  // ── Backup format v3 ───────────────────────────────────────────────────────

  // One row in EVERY table (FK-consistent).
  function seedEverything(d: Db) {
    d.insert(userProfile).values({ id: 1, name: 'Full', theme: 'light' } as never).run()
    d.insert(hrZones).values({ zoneNumber: 1, minHr: 100, maxHr: 120, label: 'Easy' }).run()
    d.insert(activities).values(activity(7, '2026-07-07') as never).run()
    d.insert(trainingPlans).values({ id: 3, name: 'Plan', isActive: 1, createdAt: 5 }).run()
    d.insert(planPhases).values({ id: 4, planId: 3, name: 'Base', orderIndex: 0, durationWeeks: 1 }).run()
    d.insert(planWeeks).values({ id: 5, phaseId: 4, weekNumber: 1 }).run()
    d.insert(planSessions).values({
      id: 6, weekId: 5, dayOfWeek: 1, type: 'running', status: 'completed', linkedActivityId: 7,
    }).run()
    d.insert(habits).values({ id: 8, name: 'Stretch', createdAt: 9 }).run()
    d.insert(habitLogs).values({ id: 9, habitId: 8, date: '2026-07-07', completedAt: 10 }).run()
    d.insert(dailyCheckins).values({ id: 10, date: '2026-07-07', createdAt: 1, updatedAt: 2 }).run()
    d.insert(recoveryLogs).values({ id: 11, date: '2026-07-07', hrvRmssd: 55.5, createdAt: 1, updatedAt: 2 }).run()
    d.insert(nutritionLogs).values({ id: 12, date: '2026-07-07', calories: 500, createdAt: 1 }).run()
    d.insert(bodyMetrics).values({ id: 13, date: '2026-07-07', weightKg: 70.5, createdAt: 1 }).run()
    d.insert(challengePool).values({ id: 14, text: 'Do 20 push-ups', category: 'fitness' }).run()
    d.insert(dailyChallenges).values({ id: 15, date: '2026-07-07', poolId: 14, text: 'Do 20 push-ups' }).run()
  }

  function dump(d: Db) {
    return {
      userProfile: d.select().from(userProfile).all(),
      hrZones: d.select().from(hrZones).all(),
      activities: d.select().from(activities).all(),
      trainingPlans: d.select().from(trainingPlans).all(),
      planPhases: d.select().from(planPhases).all(),
      planWeeks: d.select().from(planWeeks).all(),
      planSessions: d.select().from(planSessions).all(),
      habits: d.select().from(habits).all(),
      habitLogs: d.select().from(habitLogs).all(),
      dailyCheckins: d.select().from(dailyCheckins).all(),
      recoveryLogs: d.select().from(recoveryLogs).all(),
      nutritionLogs: d.select().from(nutritionLogs).all(),
      bodyMetrics: d.select().from(bodyMetrics).all(),
      challengePool: d.select().from(challengePool).all(),
      dailyChallenges: d.select().from(dailyChallenges).all(),
    }
  }

  async function v3File(): Promise<Record<string, unknown>> {
    const src = await makeDb()
    seedEverything(src)
    return JSON.parse(JSON.stringify(exportBackup(src))) as Record<string, unknown>
  }

  it('exports version 3 containing every table', async () => {
    const src = await makeDb()
    seedEverything(src)
    const exported = exportBackup(src)
    expect(exported.version).toBe(3)
    expect(BACKUP_VERSION).toBe(3)
    for (const [key, rows] of Object.entries(dump(src))) {
      expect(rows.length, 'seed ' + key).toBeGreaterThan(0)
      expect(Array.isArray(exported[key]), key).toBe(true)
      expect((exported[key] as unknown[]).length, key).toBe(rows.length)
    }
  })

  it('v3 round-trip restores every table', async () => {
    const src = await makeDb()
    seedEverything(src)
    const file = JSON.parse(JSON.stringify(exportBackup(src))) as Record<string, unknown>

    // Target already holds different data in several tables (plus beforeEach data)
    db.insert(recoveryLogs).values({ id: 99, date: '2020-01-01', createdAt: 1, updatedAt: 1 }).run()
    db.insert(habits).values({ id: 98, name: 'Old habit', createdAt: 1 }).run()

    const result = importBackup(db, file)
    expect(result.success).toBe(true)
    expect(dump(db)).toEqual(dump(src))
  })

  it('v2 import replaces the original 7 tables but leaves newer tables untouched', () => {
    db.insert(recoveryLogs).values({ id: 5, date: '2026-01-01', createdAt: 1, updatedAt: 1 }).run()
    db.insert(habits).values({ id: 1, name: 'Keep me', createdAt: 1 }).run()
    db.insert(challengePool).values({ id: 1, text: 'Keep', category: 'fitness' }).run()

    const result = importBackup(db, {
      version: 2,
      activities: [activity(50, '2026-06-01')],
      // newer-table keys in a v2 file must be ignored
      recoveryLogs: [{ id: 77, date: '1999-01-01', createdAt: 1, updatedAt: 1 }],
    })

    expect(result.success).toBe(true)
    expect(db.select().from(activities).all()).toHaveLength(1)
    const rec = db.select().from(recoveryLogs).all()
    expect(rec).toHaveLength(1)
    expect(rec[0].id).toBe(5)
    expect(db.select().from(habits).all()[0].name).toBe('Keep me')
    expect(db.select().from(challengePool).all()).toHaveLength(1)
  })

  it('v1 import is accepted too', () => {
    const result = importBackup(db, { version: 1, activities: [activity(60, '2026-06-02')] })
    expect(result.success).toBe(true)
    expect(db.select().from(activities).all()[0].date).toBe('2026-06-02')
  })

  it('rejects a malformed v3 file and changes nothing', async () => {
    const file = await v3File()
    file.recoveryLogs = 'x'

    db.insert(recoveryLogs).values({ id: 5, date: '2026-01-01', createdAt: 1, updatedAt: 1 }).run()
    const before = dump(db)

    const result = importBackup(db, file)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/malformed/i)
    expect(dump(db)).toEqual(before)
  })

  it('rejects a v3 file with a missing table and changes nothing', async () => {
    const file = await v3File()
    delete file.habits
    const before = dump(db)

    const result = importBackup(db, file)
    expect(result.success).toBe(false)
    expect(dump(db)).toEqual(before)
  })

  it('a v3 file whose insert fails midway leaves original data intact', async () => {
    const file = await v3File()
    // Fails late in the insert order (after most tables were already replaced)
    ;(file.dailyChallenges as Record<string, unknown>[])[0].text = null

    db.insert(recoveryLogs).values({ id: 5, date: '2026-01-01', createdAt: 1, updatedAt: 1 }).run()
    db.insert(habits).values({ id: 1, name: 'Original habit', createdAt: 1 }).run()
    const before = dump(db)

    const result = importBackup(db, file)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/previous data was restored/i)
    expect(dump(db)).toEqual(before)
  })
})
