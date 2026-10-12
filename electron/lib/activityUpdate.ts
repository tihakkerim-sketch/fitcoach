/** Aktivität bearbeiten. Ändert sich Datum oder Typ, wird die Plan-Zuordnung neu berechnet. Ohne `electron`-Import. */
import { eq } from 'drizzle-orm'
import { activities } from '../../db/schema'
import type { UpdateActivityPayload } from '../../src/types/ipc'
import { matchActivity, releaseActivity } from './matchSessions'
import { runInTransaction, type TxDb } from './transaction'
import type { ActivityDbRow } from './activityInsert'

type Patch = Partial<typeof activities.$inferInsert>

export function updateActivity(db: TxDb, p: UpdateActivityPayload): ActivityDbRow {
  return runInTransaction(db, () => {
    const old = db.select().from(activities).where(eq(activities.id, p.id)).get()
    if (!old) throw new Error('Diese Aktivität existiert nicht mehr.')

    const patch: Patch = {}
    const plain = [
      'type', 'date', 'avgHr', 'maxHr', 'durationMin', 'startTime', 'distanceKm', 'perceivedEffort',
      'surfaceType', 'notes', 'avgCadence', 'bedtime', 'wakeTime', 'sleepQuality', 'typeLabel',
      'elevationGainM', 'elevationLossM', 'movingTimeMin', 'shoeId',
    ] as const
    for (const key of plain) {
      const v = p[key]
      if (v !== undefined) (patch as Record<string, unknown>)[key] = v // null leert das Feld
    }
    if (p.hrZoneDistribution !== undefined) {
      patch.hrZoneDistribution = p.hrZoneDistribution ? JSON.stringify(p.hrZoneDistribution) : null
    }
    if (p.exercises !== undefined) {
      patch.exercises = p.exercises ? JSON.stringify(p.exercises) : null
    }
    // type und date sind NOT NULL – null wird ignoriert (Schema erlaubt es ohnehin nicht)

    const reMatch = (patch.date !== undefined && patch.date !== old.date)
      || (patch.type !== undefined && patch.type !== old.type)
    if (reMatch) releaseActivity(db, p.id)
    if (Object.keys(patch).length > 0) {
      db.update(activities).set(patch).where(eq(activities.id, p.id)).run()
    }
    if (reMatch) matchActivity(db, p.id)

    return db.select().from(activities).where(eq(activities.id, p.id)).get()!
  })
}
