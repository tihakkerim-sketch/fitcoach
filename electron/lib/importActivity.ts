/**
 * Importierte Aktivität speichern: Duplikat-Prüfung → Aktivität → Splits → Verläufe → Auto-Zuordnung,
 * alles in EINER Transaktion (ganz oder gar nicht). Ohne `electron`-Import.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { activities, activitySplits, activityStreams } from '../../db/schema'
import type { ActivitySource, CreateActivityPayload } from '../../src/types/ipc'
import { computeSplits, downsampleStreams } from './activityDetails'
import { insertActivity } from './activityInsert'
import { findDuplicate } from './dedupe'
import type { ParsedActivity } from './garminParse'
import { matchActivity } from './matchSessions'
import { runInTransaction, type TxDb } from './transaction'

export interface SaveImportedOptions {
  fileName?: string
  externalId?: string
  source: ActivitySource
}

export interface SaveImportedResult {
  status: 'created' | 'duplicate'
  activityId: number
}

export function saveImported(db: TxDb, parsed: ParsedActivity, opts: SaveImportedOptions): SaveImportedResult {
  const a = parsed.activity
  if (!a.date) throw new Error('Datum fehlt in der Aktivität')

  return runInTransaction(db, () => {
    const dupId = findDuplicate(db, {
      externalId: opts.externalId,
      date: a.date as string,
      startTime: a.startTime,
      type: a.type ?? 'custom',
      distanceKm: a.distanceKm,
      durationMin: a.durationMin,
    })
    if (dupId !== null) {
      // Per Zeit/Distanz gefunden (z. B. vorher als Datei importiert): externe ID nachtragen,
      // damit der nächste Sync den Lauf schon an der ID erkennt und nichts mehr herunterlädt.
      if (opts.externalId) {
        db.update(activities).set({ externalId: opts.externalId })
          .where(and(eq(activities.id, dupId), isNull(activities.externalId))).run()
      }
      return { status: 'duplicate' as const, activityId: dupId }
    }

    const payload: CreateActivityPayload = {
      ...a,
      type: a.type ?? 'custom',
      date: a.date as string,
      source: opts.source,
      garminFileName: opts.fileName ?? a.garminFileName,
      externalId: opts.externalId ?? a.externalId,
    }
    const row = insertActivity(db, payload)

    const splits = computeSplits(parsed.samples)
    if (splits.length > 0) {
      db.insert(activitySplits).values(splits.map(s => ({
        activityId: row.id,
        splitIndex: s.splitIndex,
        distanceKm: s.distanceKm,
        durationSec: s.durationSec,
        paceSecPerKm: s.paceSecPerKm ?? null,
        avgHr: s.avgHr ?? null,
        elevationGainM: s.elevationGainM ?? null,
        elevationLossM: s.elevationLossM ?? null,
      }))).run()
    }

    if (parsed.samples.length >= 2) {
      const streams = downsampleStreams(parsed.samples, 500)
      db.insert(activityStreams).values({ activityId: row.id, data: JSON.stringify(streams) }).run()
    }

    matchActivity(db, row.id)
    return { status: 'created' as const, activityId: row.id }
  })
}
