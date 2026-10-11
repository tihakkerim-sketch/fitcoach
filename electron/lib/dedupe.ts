/**
 * Duplikat-Erkennung für importierte Aktivitäten. Ohne `electron`-Import.
 *
 * Treffer, wenn
 *  - dieselbe `external_id` schon existiert, oder
 *  - gleicher Tag + beide mit Startzeit: Start ±2 Min + Distanz ±3 % (ohne Distanz: Dauer ±3 %), oder
 *  - gleicher Tag + (eine Seite ohne Startzeit): gleicher Typ + Distanz ±3 %.
 * Lässt sich nichts vergleichen, gilt es NICHT als Duplikat (lieber doppelt als Daten verlieren).
 */
import { asc, eq } from 'drizzle-orm'
import { activities } from '../../db/schema'
import type { TxDb } from './transaction'

export interface DuplicateCandidate {
  externalId?: string
  date: string
  startTime?: string
  type: string
  distanceKm?: number
  durationMin?: number
}

const START_TOLERANCE_MIN = 2
const REL_TOLERANCE = 0.03

const minutesOfDay = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const within3Percent = (a: number, b: number): boolean => Math.abs(a - b) <= REL_TOLERANCE * Math.max(a, b)
const positive = (v: number | null | undefined): v is number => typeof v === 'number' && v > 0

/** ID der bereits vorhandenen Aktivität oder null. */
export function findDuplicate(db: TxDb, cand: DuplicateCandidate): number | null {
  if (cand.externalId) {
    const hit = db.select({ id: activities.id }).from(activities)
      .where(eq(activities.externalId, cand.externalId)).get()
    if (hit) return hit.id
  }

  const sameDay = db.select().from(activities)
    .where(eq(activities.date, cand.date)).orderBy(asc(activities.id)).all()

  for (const row of sameDay) {
    if (cand.startTime && row.startTime) {
      if (Math.abs(minutesOfDay(cand.startTime) - minutesOfDay(row.startTime)) > START_TOLERANCE_MIN) continue
      if (positive(cand.distanceKm) && positive(row.distanceKm)) {
        if (within3Percent(cand.distanceKm, row.distanceKm)) return row.id
      } else if (!positive(cand.distanceKm) && !positive(row.distanceKm)
        && positive(cand.durationMin) && positive(row.durationMin)) {
        if (within3Percent(cand.durationMin, row.durationMin)) return row.id
      }
      continue
    }
    if (row.type === cand.type && positive(cand.distanceKm) && positive(row.distanceKm)
      && within3Percent(cand.distanceKm, row.distanceKm)) {
      return row.id
    }
  }
  return null
}
