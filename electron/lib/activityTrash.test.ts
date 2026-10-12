import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { activities, activitySplits, activityStreams, planSessions, planWeeks, shoes, trainingPlans } from '../../db/schema'
import { makeTestDb, type TestDb } from './testDb'
import { insertActivity } from './activityInsert'
import { matchActivity, releaseActivity } from './matchSessions'
import { restoreActivity, snapshotActivity } from './activityTrash'

let db: TestDb
let sessionId: number

beforeEach(async () => {
  db = await makeTestDb()
  const [p] = db.insert(trainingPlans).values({ name: 'T', startDate: '2026-10-05', isActive: 1, createdAt: 1 }).returning().all()
  const [w] = db.insert(planWeeks).values({ planId: p.id, weekIndex: 0 }).returning().all()
  sessionId = db.insert(planSessions).values({ weekId: w.id, dayOfWeek: 1, type: 'running' }).returning().all()[0].id
})

const session = () => db.select().from(planSessions).where(eq(planSessions.id, sessionId)).get()!

function setup() {
  const a = insertActivity(db, { type: 'running', date: '2026-10-05', source: 'manual', distanceKm: 8, durationMin: 50, notes: 'hi' } as never)
  matchActivity(db, a.id, 1234)
  db.insert(activitySplits).values([
    { activityId: a.id, splitIndex: 1, distanceKm: 1, durationSec: 300 },
    { activityId: a.id, splitIndex: 2, distanceKm: 1, durationSec: 310 },
  ]).run()
  db.insert(activityStreams).values({ activityId: a.id, data: '{"t":[1]}' }).run()
  return a
}

function remove(id: number) {
  releaseActivity(db, id)
  db.delete(activities).where(eq(activities.id, id)).run()
}

describe('activityTrash', () => {
  it('Snapshot einer unbekannten ID ist null', () => {
    expect(snapshotActivity(db, 42)).toBeNull()
  })

  it('stellt Zeile, Splits, Verlauf und Plan-Verknüpfung wieder her', () => {
    const a = setup()
    db.update(planSessions).set({ completionNote: 'lief gut' }).where(eq(planSessions.id, sessionId)).run()
    const snap = snapshotActivity(db, a.id)!
    expect(snap.splits).toHaveLength(2)
    expect(snap.planLinks).toHaveLength(1)

    remove(a.id)
    expect(db.select().from(activities).all()).toHaveLength(0)
    expect(session()).toMatchObject({ status: 'planned', linkedActivityId: null })

    const back = restoreActivity(db, snap)
    expect(back).toMatchObject({ id: a.id, notes: 'hi', distanceKm: 8 })
    expect(db.select().from(activitySplits).where(eq(activitySplits.activityId, a.id)).all()).toHaveLength(2)
    expect(db.select().from(activityStreams).get()?.data).toBe('{"t":[1]}')
    expect(session()).toMatchObject({ status: 'completed', linkedActivityId: a.id, matchSource: 'auto', completedAt: 1234, completionNote: 'lief gut' })
  })

  it('Session inzwischen anderweitig belegt → nicht überschreiben, Aktivität kommt trotzdem zurück', () => {
    const a = setup()
    const snap = snapshotActivity(db, a.id)!
    remove(a.id)
    const other = insertActivity(db, { type: 'running', date: '2026-10-05', source: 'manual' } as never)
    matchActivity(db, other.id)
    expect(session().linkedActivityId).toBe(other.id)
    restoreActivity(db, snap)
    expect(session().linkedActivityId).toBe(other.id)
    expect(db.select().from(activities).where(eq(activities.id, a.id)).get()).toBeDefined()
  })

  it('ohne gespeicherte Verknüpfung wird neu zugeordnet', () => {
    const a = insertActivity(db, { type: 'running', date: '2026-10-05', source: 'manual' } as never)
    const snap = snapshotActivity(db, a.id)!
    expect(snap.planLinks).toHaveLength(0)
    remove(a.id)
    restoreActivity(db, snap)
    expect(session().linkedActivityId).toBe(a.id)
  })

  it('gelöschter Schuh → shoeId wird leer statt Fehler; belegte ID → Fehler', () => {
    db.insert(shoes).values({ id: 5, name: 'S', createdAt: 1 }).run()
    const a = insertActivity(db, { type: 'running', date: '2026-10-01', source: 'manual', shoeId: 5 } as never)
    const snap = snapshotActivity(db, a.id)!
    remove(a.id)
    db.delete(shoes).where(eq(shoes.id, 5)).run()
    expect(restoreActivity(db, snap).shoeId).toBeNull()
    expect(() => restoreActivity(db, snap)).toThrow(/nicht mehr wiederhergestellt/)
  })
})
