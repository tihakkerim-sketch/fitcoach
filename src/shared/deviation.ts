/** Soll-Ist-Vergleich einer Einheit mit dem verknüpften Lauf. */

export type DeviationItem = { field: 'distance' | 'duration' | 'pace'; planned: number; actual: number; pct: number }

interface Planned {
  targetDistanceKm?: number | null
  targetDurationMin?: number | null
  targetPaceFastSec?: number | null
  targetPaceSlowSec?: number | null
}
interface Actual { distanceKm?: number | null; durationMin?: number | null }

const pos = (n: number | null | undefined): n is number => typeof n === 'number' && n > 0
const pct = (planned: number, actual: number) => Math.round(((actual - planned) / planned) * 100)

export function computeDeviation(planned: Planned, actual: Actual): DeviationItem[] {
  const out: DeviationItem[] = []
  if (pos(planned.targetDistanceKm) && pos(actual.distanceKm)) {
    out.push({ field: 'distance', planned: planned.targetDistanceKm, actual: actual.distanceKm, pct: pct(planned.targetDistanceKm, actual.distanceKm) })
  }
  if (pos(planned.targetDurationMin) && pos(actual.durationMin)) {
    out.push({ field: 'duration', planned: planned.targetDurationMin, actual: actual.durationMin, pct: pct(planned.targetDurationMin, actual.durationMin) })
  }
  const fast = pos(planned.targetPaceFastSec) ? planned.targetPaceFastSec : null
  const slow = pos(planned.targetPaceSlowSec) ? planned.targetPaceSlowSec : null
  const plannedPace = fast !== null && slow !== null ? (fast + slow) / 2 : (fast ?? slow)
  if (plannedPace !== null && pos(actual.distanceKm) && pos(actual.durationMin)) {
    const actualPace = (actual.durationMin * 60) / actual.distanceKm
    out.push({ field: 'pace', planned: plannedPace, actual: actualPace, pct: pct(plannedPace, actualPace) })
  }
  return out
}
