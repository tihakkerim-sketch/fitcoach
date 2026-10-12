import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { shoes, planSessions, planWeeks, trainingPlans } from '../../db/schema'
import { makeTestDb, type TestDb } from './testDb'
import { insertActivity } from './activityInsert'
import { matchActivity } from './matchSessions'
import { updateActivity } from './activityUpdate'

let db: TestDb
let sessionMon: number
let sessionTue: number

beforeEach(async () => {
  db = await makeTestDb()
  const [p] = db.insert(trainingPlans).values({ name: 'T', startDate: '2026-10-05', isActive: 1, createdAt: 1 }).returning().all()
  const [w] = db.insert(planWeeks).values({ planId: p.id, weekIndex: 0 }).returning().all()
  sessionMon = db.insert(planSessions).values({ weekId: w.id, dayOfWeek: 1, type: 'running' }).returning().all()[0].id
  sessionTue = db.insert(planSessions).values({ weekId: w.id, dayOfWeek: 2, type: 'running' }).returning().all()[0].id
})

const session = (id: number) => db.select().from(planSessions).where(eq(planSessions.id, id)).get()!
const mk = (date: string) => {
  const a = insertActivity(db, { type: 'running', date, source: 'manual', distanceKm: 8, durationMin: 50, notes: 'alt' } as never)
  matchActivity(db, a.id)
  return a
}

describe('updateActivity', () => {
  it('ändert nur gesetzte Felder, null leert, undefined lässt unberührt', () => {
    const a = mk('2026-10-05')
    const r = updateActivity(db, { id: a.id, distanceKm: 10, notes: null })
    expect(r).toMatchObject({ distanceKm: 10, notes: null, durationMin: 50, date: '2026-10-05' })
  })

  it('JSON-Felder: Zonen und Übungen', () => {
    const a = mk('2026-10-05')
    const r = updateActivity(db, { id: a.id, hrZoneDistribution: { z1: 10, z2: 60, z3: 20, z4: 10, z5: 0 }, exercises: [{ name: 'Kniebeuge', sets: 3, reps: 10 }] })
    expect(JSON.parse(r.hrZoneDistribution!).z2).toBe(60)
    expect(JSON.parse(r.exercises!)[0].name).toBe('Kniebeuge')
    expect(updateActivity(db, { id: a.id, exercises: null }).exercises).toBeNull()
  })

  it('Datum geändert → Zuordnung wandert zur neuen Einheit', () => {
    const a = mk('2026-10-05')
    expect(session(sessionMon).linkedActivityId).toBe(a.id)
    updateActivity(db, { id: a.id, date: '2026-10-06' })
    expect(session(sessionMon)).toMatchObject({ status: 'planned', linkedActivityId: null })
    expect(session(sessionTue)).toMatchObject({ status: 'completed', linkedActivityId: a.id })
  })

  it('Typ geändert (Lauf → Rad) → Zuordnung gelöst', () => {
    const a = mk('2026-10-05')
    updateActivity(db, { id: a.id, type: 'cycling' })
    expect(session(sessionMon)).toMatchObject({ status: 'planned', linkedActivityId: null })
  })

  it('andere Änderung lässt die Zuordnung bestehen', () => {
    const a = mk('2026-10-05')
    updateActivity(db, { id: a.id, distanceKm: 12 })
    expect(session(sessionMon).linkedActivityId).toBe(a.id)
  })

  it('Schuh setzen und entfernen', () => {
    const a = mk('2026-10-05')
    db.insert(shoes).values({ id: 1, name: 'X', createdAt: 1 }).run()
    expect(updateActivity(db, { id: a.id, shoeId: 1 }).shoeId).toBe(1)
    expect(updateActivity(db, { id: a.id, shoeId: null }).shoeId).toBeNull()
  })

  it('unbekannte ID → deutscher Fehler', () => {
    expect(() => updateActivity(db, { id: 999, notes: 'x' })).toThrow(/existiert nicht mehr/)
  })
})
