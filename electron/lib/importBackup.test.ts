import { describe, it, expect, beforeEach } from 'vitest'
import {
  activities, userProfile, hrZones, trainingPlans, planWeeks, planSessions,
  dailyCheckins, recoveryLogs,
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

  // ── Backup format v4/v5 ───────────────────────────────────────────────────────

  // One row in EVERY table (FK-consistent).
  function seedEverything(d: Db) {
    d.insert(userProfile).values({ id: 1, name: 'Full', theme: 'light' } as never).run()
    d.insert(hrZones).values({ zoneNumber: 1, minHr: 100, maxHr: 120, label: 'Easy' }).run()
    d.insert(activities).values(activity(7, '2026-07-07') as never).run()
    d.insert(trainingPlans).values({ id: 3, name: 'Plan', startDate: '2026-07-06', isActive: 1, createdAt: 5 }).run()
    d.insert(planWeeks).values({ id: 5, planId: 3, weekIndex: 0, phase: 'Base' }).run()
    d.insert(planSessions).values({
      id: 6, weekId: 5, dayOfWeek: 2, type: 'running', status: 'completed', linkedActivityId: 7, matchSource: 'manual',
      targetDistanceKm: 8, steps: '[]',
    }).run()
    d.insert(dailyCheckins).values({ id: 10, date: '2026-07-07', createdAt: 1, updatedAt: 2 }).run()
    d.insert(recoveryLogs).values({ id: 11, date: '2026-07-07', hrvRmssd: 55.5, createdAt: 1, updatedAt: 2 }).run()
  }

  function dump(d: Db) {
    return {
      userProfile: d.select().from(userProfile).all(),
      hrZones: d.select().from(hrZones).all(),
      activities: d.select().from(activities).all(),
      trainingPlans: d.select().from(trainingPlans).all(),
      planWeeks: d.select().from(planWeeks).all(),
      planSessions: d.select().from(planSessions).all(),
      dailyCheckins: d.select().from(dailyCheckins).all(),
      recoveryLogs: d.select().from(recoveryLogs).all(),
    }
  }

  async function v4File(): Promise<Record<string, unknown>> {
    const src = await makeDb()
    seedEverything(src)
    return JSON.parse(JSON.stringify(exportBackup(src))) as Record<string, unknown>
  }

  // Datei im alten Format (v4 mit Phasen), Rest der Tabellen wie in v5
  async function legacyV4File(): Promise<Record<string, unknown>> {
    const file = await v4File()
    file.version = 4
    file.trainingPlans = [{ id: 3, name: 'Plan', goalEvent: null, goalDate: null, isActive: 1, createdAt: new Date('2026-07-08T10:00:00').getTime() }]
    file.planPhases = [{ id: 4, planId: 3, name: 'Base', orderIndex: 0, durationWeeks: 1 }]
    file.planWeeks = [{ id: 5, phaseId: 4, weekNumber: 1, notes: 'Woche' }]
    file.planSessions = [
      { id: 6, weekId: 5, dayOfWeek: 2, type: 'running', targetDurationMin: 40, targetHrZone: 2, intensityLabel: 'Easy',
        coachingNote: null, status: 'completed', linkedActivityId: 7, completedAt: 9, completionNote: null },
      { id: 8, weekId: 5, dayOfWeek: 4, type: 'rest', targetDurationMin: null, targetHrZone: null, intensityLabel: null,
        coachingNote: null, status: 'planned', linkedActivityId: null, completedAt: null, completionNote: null },
    ]
    return file
  }

  it('v4 mit Phasen wird ins neue Plan-Modell umgewandelt statt abgelehnt', async () => {
    const file = await legacyV4File() // Aktivität 7 liegt am 2026-07-07 (Di) = Woche 0, Tag 2
    const result = importBackup(db, file)
    expect(result.success).toBe(true)
    const plans = db.select().from(trainingPlans).all()
    expect(plans).toHaveLength(1)
    expect(plans[0].startDate).toBe('2026-07-06')
    expect(plans[0].isActive).toBe(0)
    expect(db.select().from(planWeeks).all()).toMatchObject([{ planId: 3, weekIndex: 0, phase: 'Base', notes: 'Woche' }])
    const sessions = db.select().from(planSessions).all()
    expect(sessions).toHaveLength(2)
    expect(sessions[0]).toMatchObject({ id: 6, title: 'Easy', linkedActivityId: 7, matchSource: 'manual', status: 'completed' })
  })

  it('v4 ohne planPhases-Feld gilt als leer (Wochen ohne Phase werden ignoriert)', async () => {
    const file = await legacyV4File()
    delete file.planPhases
    const result = importBackup(db, file)
    expect(result.success).toBe(true)
    expect(db.select().from(trainingPlans).all()).toHaveLength(1)
    expect(db.select().from(planWeeks).all()).toHaveLength(0)
    expect(db.select().from(planSessions).all()).toHaveLength(0)
  })

  it('v5-Rundlauf behält Startdatum und Zeilenzahlen', async () => {
    const src = await makeDb()
    seedEverything(src)
    const file = JSON.parse(JSON.stringify(exportBackup(src))) as Record<string, unknown>
    expect(file.version).toBe(5)
    expect(file.planPhases).toBeUndefined()
    const result = importBackup(db, file)
    expect(result.success).toBe(true)
    expect(db.select().from(trainingPlans).all()[0].startDate).toBe('2026-07-06')
    expect(db.select().from(planWeeks).all()).toHaveLength(1)
    expect(db.select().from(planSessions).all()).toHaveLength(1)
  })

  it('v5 ohne planWeeks-Feld wird abgelehnt, Daten bleiben', async () => {
    const file = await v4File()
    delete file.planWeeks
    const before = dump(db)
    const result = importBackup(db, file)
    expect(result.success).toBe(false)
    expect(dump(db)).toEqual(before)
  })

  it('unbekannte Version 6 wird abgelehnt', async () => {
    const file = await v4File()
    file.version = 6
    const before = dump(db)
    expect(importBackup(db, file).success).toBe(false)
    expect(dump(db)).toEqual(before)
  })

  it('exports version 5 containing every table', async () => {
    const src = await makeDb()
    seedEverything(src)
    const exported = exportBackup(src)
    expect(exported.version).toBe(5)
    expect(BACKUP_VERSION).toBe(5)
    for (const [key, rows] of Object.entries(dump(src))) {
      expect(rows.length, 'seed ' + key).toBeGreaterThan(0)
      expect(Array.isArray(exported[key]), key).toBe(true)
      expect((exported[key] as unknown[]).length, key).toBe(rows.length)
    }
  })

  it('v4 round-trip restores every table', async () => {
    const src = await makeDb()
    seedEverything(src)
    const file = JSON.parse(JSON.stringify(exportBackup(src))) as Record<string, unknown>

    // Target already holds different data in several tables (plus beforeEach data)
    db.insert(recoveryLogs).values({ id: 99, date: '2020-01-01', createdAt: 1, updatedAt: 1 }).run()
    db.insert(dailyCheckins).values({ id: 98, date: '2020-01-02', createdAt: 1, updatedAt: 1 }).run()

    const result = importBackup(db, file)
    expect(result.success).toBe(true)
    expect(dump(db)).toEqual(dump(src))
  })

  it('v2 import replaces the original 7 tables but leaves check-ins/recovery untouched', () => {
    db.insert(recoveryLogs).values({ id: 5, date: '2026-01-01', createdAt: 1, updatedAt: 1 }).run()
    db.insert(dailyCheckins).values({ id: 1, date: '2026-01-01', morningIntention: 'Keep me', createdAt: 1, updatedAt: 1 }).run()

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
    expect(db.select().from(dailyCheckins).all()[0].morningIntention).toBe('Keep me')
  })

  it('v1 import is accepted too', () => {
    const result = importBackup(db, { version: 1, activities: [activity(60, '2026-06-02')] })
    expect(result.success).toBe(true)
    expect(db.select().from(activities).all()[0].date).toBe('2026-06-02')
  })

  it('rejects a malformed v3 file and changes nothing', async () => {
    const file = await v4File()
    file.recoveryLogs = 'x'

    db.insert(recoveryLogs).values({ id: 5, date: '2026-01-01', createdAt: 1, updatedAt: 1 }).run()
    const before = dump(db)

    const result = importBackup(db, file)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/malformed/i)
    expect(dump(db)).toEqual(before)
  })

  it('rejects a v4 file with a missing table and changes nothing', async () => {
    const file = await v4File()
    delete file.dailyCheckins
    const before = dump(db)

    const result = importBackup(db, file)
    expect(result.success).toBe(false)
    expect(dump(db)).toEqual(before)
  })

  it('a v4 file whose insert fails midway leaves original data intact', async () => {
    const file = await v4File()
    // Fails late in the insert order (after most tables were already replaced)
    ;(file.recoveryLogs as Record<string, unknown>[])[0].createdAt = null

    db.insert(recoveryLogs).values({ id: 5, date: '2026-01-01', createdAt: 1, updatedAt: 1 }).run()
    db.insert(dailyCheckins).values({ id: 1, date: '2026-01-01', createdAt: 1, updatedAt: 1 }).run()
    const before = dump(db)

    const result = importBackup(db, file)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/previous data was restored/i)
    expect(dump(db)).toEqual(before)
  })

  it('imports an old v3 file: removed-table keys are ignored, the rest is restored', async () => {
    const file = await legacyV4File()
    file.version = 3
    file.habits = [{ id: 1, name: 'Gone', emoji: 'x', color: 'blue', createdAt: 1 }]
    file.habitLogs = [{ id: 1, habitId: 1, date: '2026-07-07', completedAt: 1 }]
    file.nutritionLogs = 'not even an array'
    ;(file.userProfile as Record<string, unknown>[])[0].dailyCalorieTarget = 2500

    const result = importBackup(db, file)
    expect(result.success).toBe(true)
    expect(db.select().from(recoveryLogs).all()).toHaveLength(1)
    expect(db.select().from(activities).all()[0].date).toBe('2026-07-07')
  })
})
