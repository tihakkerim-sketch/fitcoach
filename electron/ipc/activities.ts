import { IPC } from '../../src/types/ipc'
import type { ActivityRow } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { activities } from '../../db/schema'
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm'
import { runInTransaction } from '../lib/transaction'
import { matchActivity, releaseActivity } from '../lib/matchSessions'

export function registerActivityHandlers() {
  handle(IPC.ACTIVITIES_CREATE, (payload) => {
    const db = getDb()
    // Insert + automatische Zuordnung zur Plan-Einheit: ganz oder gar nicht
    const row = runInTransaction(db, () => {
      const [inserted] = db
        .insert(activities)
        .values({
          type: payload.type,
          date: payload.date,
          createdAt: Date.now(),
          source: payload.source,
          garminFileName: payload.garminFileName ?? null,
          avgHr: payload.avgHr ?? null,
          maxHr: payload.maxHr ?? null,
          durationMin: payload.durationMin ?? null,
          startTime: payload.startTime ?? null,
          distanceKm: payload.distanceKm ?? null,
          hrZoneDistribution: payload.hrZoneDistribution
            ? JSON.stringify(payload.hrZoneDistribution)
            : null,
          perceivedEffort: payload.perceivedEffort ?? null,
          surfaceType: payload.surfaceType ?? null,
          notes: payload.notes ?? null,
          avgCadence: payload.avgCadence ?? null,
          bedtime: payload.bedtime ?? null,
          wakeTime: payload.wakeTime ?? null,
          sleepQuality: payload.sleepQuality ?? null,
          exercises: payload.exercises ? JSON.stringify(payload.exercises) : null,
          typeLabel: payload.typeLabel ?? null,
          rawGarminData: payload.rawGarminData
            ? JSON.stringify(payload.rawGarminData)
            : null,
        })
        .returning()
        .all()
      matchActivity(db, inserted.id)
      return inserted
    })
    return deserializeActivity(row)
  })

  handle(IPC.ACTIVITIES_LIST, (payload) => {
    const db = getDb()
    const conditions = []
    if (payload.type) conditions.push(eq(activities.type, payload.type))
    if (payload.dateFrom) conditions.push(gte(activities.date, payload.dateFrom))
    if (payload.dateTo) conditions.push(lte(activities.date, payload.dateTo))
    if (payload.source) conditions.push(eq(activities.source, payload.source))

    const whereClause = conditions.length ? and(...conditions) : undefined

    const orderCol =
      payload.sortBy === 'duration'
        ? activities.durationMin
        : payload.sortBy === 'avgHr'
        ? activities.avgHr
        : activities.date

    const rows = db
      .select()
      .from(activities)
      .where(whereClause)
      .orderBy(payload.sortDir === 'asc' ? asc(orderCol) : desc(orderCol))
      .limit(payload.limit ?? 20)
      .offset(payload.offset ?? 0)
      .all()

    // Count total matching rows for pagination
    const [{ count }] = db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(whereClause)
      .all()

    return { activities: rows.map(deserializeActivity), total: count }
  })

  handle(IPC.ACTIVITIES_GET, (id) => {
    const db = getDb()
    const row = db.select().from(activities).where(eq(activities.id, id)).get()
    return row ? deserializeActivity(row) : null
  })

  handle(IPC.ACTIVITIES_DELETE, (id) => {
    const db = getDb()
    // Zuordnungen lösen (und freie Läufe desselben Tages nachrücken lassen), dann löschen
    runInTransaction(db, () => {
      releaseActivity(db, id)
      db.delete(activities).where(eq(activities.id, id)).run()
    })
  })
}

function deserializeActivity(row: typeof activities.$inferSelect): ActivityRow {
  return {
    id: row.id,
    type: row.type as ActivityRow['type'],
    date: row.date,
    createdAt: row.createdAt,
    source: row.source as ActivityRow['source'],
    garminFileName: row.garminFileName ?? undefined,
    avgHr: row.avgHr ?? undefined,
    maxHr: row.maxHr ?? undefined,
    durationMin: row.durationMin ?? undefined,
    startTime: row.startTime ?? undefined,
    distanceKm: row.distanceKm ?? undefined,
    hrZoneDistribution: row.hrZoneDistribution
      ? JSON.parse(row.hrZoneDistribution)
      : undefined,
    perceivedEffort: row.perceivedEffort ?? undefined,
    surfaceType: (row.surfaceType ?? undefined) as ActivityRow['surfaceType'],
    notes: row.notes ?? undefined,
    avgCadence: row.avgCadence ?? undefined,
    bedtime: row.bedtime ?? undefined,
    wakeTime: row.wakeTime ?? undefined,
    sleepQuality: row.sleepQuality ?? undefined,
    exercises: row.exercises ? JSON.parse(row.exercises) : undefined,
    typeLabel: row.typeLabel ?? undefined,
    rawGarminData: row.rawGarminData ? JSON.parse(row.rawGarminData) : undefined,
  }
}
