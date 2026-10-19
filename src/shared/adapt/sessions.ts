/** Einordnen und Umbauen einzelner Plan-Einheiten. */
import { addDaysStr } from '../planCalendar'
import type { AdaptSession, CoachChange } from './types'

/** Hart = Zielzone ≥ 3 oder Intervall-Schritte. */
export const isHard = (s: Pick<AdaptSession, 'targetHrZone' | 'hasSteps'>): boolean =>
  (s.targetHrZone ?? 0) >= 3 || s.hasSteps

/** Geplant und im 7-Tage-Fenster (heute … heute+6). */
export const inWindow = (s: AdaptSession, today: string): boolean =>
  s.status === 'planned' && s.date >= today && s.date <= addDaysStr(today, 6)

const round1 = (v: number) => Math.round(v * 10) / 10

/** Umfang (Distanz/Dauer) mit `factor` skalieren; Distanz auf 0,1 km, Dauer auf 1 min gerundet. */
export function scaleVolume(s: AdaptSession, factor: number): { targetDistanceKm?: number; targetDurationMin?: number } {
  const set: { targetDistanceKm?: number; targetDurationMin?: number } = {}
  if (s.targetDistanceKm != null) set.targetDistanceKm = round1(s.targetDistanceKm * factor)
  if (s.targetDurationMin != null) set.targetDurationMin = Math.round(s.targetDurationMin * factor)
  return set
}

/** Lockere Version: Zone 2, keine Schritte, Umfang × factor. */
export function easyVersion(s: AdaptSession, factor: number): CoachChange {
  return { action: 'update', sessionId: s.id, set: { targetHrZone: 2, steps: null, ...scaleVolume(s, factor) } }
}

/** Ruhetag statt Einheit (alle Ziele leer). */
export function restVersion(s: AdaptSession): CoachChange {
  return {
    action: 'update', sessionId: s.id,
    set: {
      type: 'rest', targetDistanceKm: null, targetDurationMin: null, targetPaceFastSec: null,
      targetPaceSlowSec: null, targetHrZone: null, steps: null,
    },
  }
}

/** Geplante Lauf-km im Zeitraum [from, to]. */
export function plannedKm(sessions: AdaptSession[], from: string, to: string): number {
  return sessions
    .filter(s => s.status === 'planned' && s.type === 'running' && s.date >= from && s.date <= to)
    .reduce((sum, s) => sum + (s.targetDistanceKm ?? 0), 0)
}
