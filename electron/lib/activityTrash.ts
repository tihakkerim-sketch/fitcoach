/**
 * „Rückgängig" nach dem Löschen einer Aktivität: Schnappschuss (Zeile, Splits, Verlauf, Plan-Verknüpfungen)
 * vor dem Löschen, Wiederherstellen mit gleicher ID. Ohne `electron`-Import.
 */
import { eq } from 'drizzle-orm'
import { activities, activitySplits, activityStreams, planSessions, shoes } from '../../db/schema'
import { matchActivity } from './matchSessions'
import { runInTransaction, type TxDb } from './transaction'

export interface PlanLinkSnapshot {
  sessionId: number
  status: string
  matchSource: string | null
  completedAt: number | null
  completionNote: string | null
}

export interface ActivitySnapshot {
  activity: typeof activities.$inferSelect
  splits: (typeof activitySplits.$inferSelect)[]
  streams: typeof activityStreams.$inferSelect | null
  planLinks: PlanLinkSnapshot[]
}

export function snapshotActivity(db: TxDb, id: number): ActivitySnapshot | null {
  const activity = db.select().from(activities).where(eq(activities.id, id)).get()
  if (!activity) return null
  return {
    activity,
    splits: db.select().from(activitySplits).where(eq(activitySplits.activityId, id)).all(),
    streams: db.select().from(activityStreams).where(eq(activityStreams.activityId, id)).get() ?? null,
    planLinks: db.select().from(planSessions).where(eq(planSessions.linkedActivityId, id)).all().map(s => ({
      sessionId: s.id,
      status: s.status,
      matchSource: s.matchSource,
      completedAt: s.completedAt,
      completionNote: s.completionNote,
    })),
  }
}

/** Stellt die Aktivität wieder her (gleiche ID). Wirft, wenn die ID inzwischen belegt ist. */
export function restoreActivity(db: TxDb, snap: ActivitySnapshot): typeof activities.$inferSelect {
  return runInTransaction(db, () => {
    const id = snap.activity.id
    if (db.select({ id: activities.id }).from(activities).where(eq(activities.id, id)).get()) {
      throw new Error('Diese Aktivität kann nicht mehr wiederhergestellt werden.')
    }
    // Schuh könnte inzwischen gelöscht sein → Verknüpfung weglassen statt Fehler
    const row = { ...snap.activity }
    if (row.shoeId !== null && !db.select({ id: shoes.id }).from(shoes).where(eq(shoes.id, row.shoeId)).get()) {
      row.shoeId = null
    }
    db.insert(activities).values(row).run()
    if (snap.splits.length > 0) db.insert(activitySplits).values(snap.splits).run()
    if (snap.streams) db.insert(activityStreams).values(snap.streams).run()

    let restored = 0
    for (const link of snap.planLinks) {
      const s = db.select().from(planSessions).where(eq(planSessions.id, link.sessionId)).get()
      if (!s || s.linkedActivityId !== null) continue
      db.update(planSessions).set({
        status: link.status,
        linkedActivityId: id,
        matchSource: link.matchSource,
        completedAt: link.completedAt,
        completionNote: link.completionNote,
      }).where(eq(planSessions.id, link.sessionId)).run()
      restored++
    }
    if (restored === 0) matchActivity(db, id)
    return db.select().from(activities).where(eq(activities.id, id)).get()!
  })
}
