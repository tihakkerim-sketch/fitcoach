/**
 * Gemeinsames Einfügen einer Aktivität (manuell, Datei-Import, intervals.icu-Sync).
 * Läuft im Aufrufer-Kontext; für Mehrschritt-Schreiben der Aufrufer in `runInTransaction`.
 */
import { activities } from '../../db/schema'
import type { CreateActivityPayload } from '../../src/types/ipc'
import type { TxDb } from './transaction'

export type ActivityDbRow = typeof activities.$inferSelect

export function insertActivity(db: TxDb, payload: CreateActivityPayload, createdAt: number = Date.now()): ActivityDbRow {
  const [inserted] = db
    .insert(activities)
    .values({
      type: payload.type,
      date: payload.date,
      createdAt,
      source: payload.source,
      garminFileName: payload.garminFileName ?? null,
      avgHr: payload.avgHr ?? null,
      maxHr: payload.maxHr ?? null,
      durationMin: payload.durationMin ?? null,
      startTime: payload.startTime ?? null,
      distanceKm: payload.distanceKm ?? null,
      hrZoneDistribution: payload.hrZoneDistribution ? JSON.stringify(payload.hrZoneDistribution) : null,
      perceivedEffort: payload.perceivedEffort ?? null,
      surfaceType: payload.surfaceType ?? null,
      notes: payload.notes ?? null,
      avgCadence: payload.avgCadence ?? null,
      bedtime: payload.bedtime ?? null,
      wakeTime: payload.wakeTime ?? null,
      sleepQuality: payload.sleepQuality ?? null,
      exercises: payload.exercises ? JSON.stringify(payload.exercises) : null,
      typeLabel: payload.typeLabel ?? null,
      rawGarminData: payload.rawGarminData ? JSON.stringify(payload.rawGarminData) : null,
      elevationGainM: payload.elevationGainM ?? null,
      elevationLossM: payload.elevationLossM ?? null,
      movingTimeMin: payload.movingTimeMin ?? null,
      externalId: payload.externalId ?? null,
    })
    .returning()
    .all()
  return inserted
}
