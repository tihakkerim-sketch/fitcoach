import { IPC } from '../../src/types/ipc'
import type { ActivityRow, ActivitySplit, ActivityStreams } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { activities, activitySplits, activityStreams } from '../../db/schema'
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm'
import { runInTransaction } from '../lib/transaction'
import { matchActivity, releaseActivity } from '../lib/matchSessions'
import { insertActivity } from '../lib/activityInsert'
import { updateActivity } from '../lib/activityUpdate'
import { restoreActivity, snapshotActivity, type ActivitySnapshot } from '../lib/activityTrash'

// Die zuletzt gelöschten Aktivitäten (nur im Speicher) für „Rückgängig"
const MAX_TRASH = 10
const trash = new Map<number, ActivitySnapshot>()

export function registerActivityHandlers() {
  handle(IPC.ACTIVITIES_CREATE, (payload) => {
    const db = getDb()
    // Insert + automatische Zuordnung zur Plan-Einheit: ganz oder gar nicht
    const row = runInTransaction(db, () => {
      const inserted = insertActivity(db, payload)
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

  handle(IPC.ACTIVITIES_DETAILS, (id) => {
    const db = getDb()
    const splits: ActivitySplit[] = db.select().from(activitySplits)
      .where(eq(activitySplits.activityId, id)).orderBy(asc(activitySplits.splitIndex)).all()
      .map(r => ({
        splitIndex: r.splitIndex,
        distanceKm: r.distanceKm,
        durationSec: r.durationSec,
        paceSecPerKm: r.paceSecPerKm ?? undefined,
        avgHr: r.avgHr ?? undefined,
        elevationGainM: r.elevationGainM ?? undefined,
        elevationLossM: r.elevationLossM ?? undefined,
      }))
    const row = db.select().from(activityStreams).where(eq(activityStreams.activityId, id)).get()
    let streams: ActivityStreams | null = null
    if (row) {
      try { streams = JSON.parse(row.data) as ActivityStreams } catch { streams = null }
    }
    return { splits, streams }
  })

  handle(IPC.ACTIVITIES_UPDATE, (payload) => {
    const db = getDb()
    return deserializeActivity(updateActivity(db, payload))
  })

  handle(IPC.ACTIVITIES_DELETE, (id) => {
    const db = getDb()
    // Schnappschuss, Zuordnungen lösen (und freie Läufe desselben Tages nachrücken lassen), dann löschen
    const snap = runInTransaction(db, () => {
      const s = snapshotActivity(db, id)
      releaseActivity(db, id)
      db.delete(activities).where(eq(activities.id, id)).run()
      return s
    })
    if (snap) {
      trash.delete(id)
      trash.set(id, snap)
      while (trash.size > MAX_TRASH) trash.delete(trash.keys().next().value as number)
    }
  })

  handle(IPC.ACTIVITIES_RESTORE, (id) => {
    const snap = trash.get(id)
    if (!snap) throw new Error('Diese Aktivität kann nicht mehr wiederhergestellt werden.')
    const row = restoreActivity(getDb(), snap)
    trash.delete(id)
    return deserializeActivity(row)
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
    elevationGainM: row.elevationGainM ?? undefined,
    elevationLossM: row.elevationLossM ?? undefined,
    movingTimeMin: row.movingTimeMin ?? undefined,
    externalId: row.externalId ?? undefined,
    shoeId: row.shoeId ?? undefined,
  }
}
