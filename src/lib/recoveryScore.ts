/**
 * Readiness score calculation
 *
 * Composite 0–100 score from up to 4 inputs. Missing inputs have their
 * weights redistributed proportionally, so the formula degrades gracefully
 * when only a subset of metrics is available.
 *
 * Weights (must sum to 100):
 *   Sleep Score   35  — already 0-100
 *   Body Battery  35  — already 0-100
 *   HRV RMSSD     20  — normalised: 20 ms → 0, 80 ms → 100
 *   Resting HR    10  — normalised: 80 bpm → 0, 40 bpm → 100
 */

function normHrv(ms: number): number {
  // 20 ms = exhausted/sick baseline, 80 ms = elite recovery
  return Math.max(0, Math.min(100, ((ms - 20) / 60) * 100))
}

function normRhr(bpm: number): number {
  // lower resting HR = better recovery; clipped to [40, 80] bpm range
  return Math.max(0, Math.min(100, ((80 - bpm) / 40) * 100))
}

export interface ReadinessInputs {
  bodyBattery?:  number | null
  sleepScore?:   number | null
  hrvRmssd?:     number | null
  restingHr?:    number | null
}

/**
 * Returns a rounded 0–100 readiness score, or null when no inputs are present.
 */
export function calcReadiness(inputs: ReadinessInputs): number | null {
  const candidates: { score: number; weight: number }[] = []

  if (inputs.sleepScore  != null) candidates.push({ score: inputs.sleepScore,        weight: 35 })
  if (inputs.bodyBattery != null) candidates.push({ score: inputs.bodyBattery,        weight: 35 })
  if (inputs.hrvRmssd    != null) candidates.push({ score: normHrv(inputs.hrvRmssd),  weight: 20 })
  if (inputs.restingHr   != null) candidates.push({ score: normRhr(inputs.restingHr), weight: 10 })

  if (candidates.length === 0) return null

  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0)
  const weighted    = candidates.reduce((s, c) => s + c.score * c.weight, 0)

  return Math.round(weighted / totalWeight)
}
