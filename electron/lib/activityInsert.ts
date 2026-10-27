/**
 * Gemeinsames Einfügen einer Aktivität (manuell, Datei-Import, intervals.icu-Sync).
 * Läuft im Aufrufer-Kontext; für Mehrschritt-Schreiben der Aufrufer in `runInTransaction`.
 */
import { activities } from '../../db/schema'
import type { CreateActivityPayload } from '../../src/types/ipc'
import type { TxDb } from './transaction'
import { getDefaultShoeId } from './shoes'

export type ActivityDbRow = typeof activities.$inferSelect

/**
 * Laufkadenz in Schritten/min. Garmin und intervals.icu liefern oft nur die Schritte eines Beins
 * (z. B. 67 statt 134); echte Laufkadenz liegt praktisch immer ≥ 110 → darunter verdoppeln.
 * Andere Typen (z. B. Rad: Umdrehungen/min) bleiben unverändert.
 */
export function runCadenceSpm(type: string, cadence: number | null | undefined): number | null {
  if (cadence == null) return null
  return type === 'running' && cadence > 0 && cadence < 110 ? cadence * 2 : cadence
}

export function insertActivity(db: TxDb, payload: CreateActivityPayload, createdAt: number = Date.now()): ActivityDbRow {
  // Neue Läufe ohne Schuh-Angabe bekommen den Standard-Schuh (`null` = bewusst keiner)
  const shoeId = payload.shoeId !== undefined
    ? payload.shoeId
    : payload.type === 'running' ? getDefaultShoeId(db) : null
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
      avgCadence: runCadenceSpm(payload.type, payload.avgCadence),
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
      shoeId,
    })
    .returning()
    .all()
  return inserted
}
