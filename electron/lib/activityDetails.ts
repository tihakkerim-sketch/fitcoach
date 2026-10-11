/**
 * Lauf-Details aus Messpunkten: Splits pro km, Höhenmeter, verkleinerte Verläufe.
 * Reine Logik ohne `electron`-Import.
 */
import type { ActivitySplit, ActivityStreams } from '../../src/types/ipc'

/** Ein Messpunkt; `tSec` ab Start der Aufzeichnung, `distKm` kumuliert. */
export interface Sample {
  tSec: number
  distKm?: number
  hr?: number
  altM?: number
}

/** Mindest-Höhenänderung, ab der Auf-/Abstieg gezählt wird (GPS-/Barometer-Rauschen). */
const ELEVATION_HYSTERESIS_M = 3
/** Ein Rest-Split unter dieser Länge wird weggelassen. */
const MIN_REST_SPLIT_KM = 0.05
const PACE_WINDOW_SEC = 30
const MAX_PACE_SEC_PER_KM = 1200

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Auf-/Abstieg mit Hysterese: erst wenn sich die Höhe ≥ 3 m vom Bezugspunkt entfernt hat, zählt es. */
export function elevation(samples: readonly Sample[]): { gainM: number; lossM: number } {
  let ref: number | null = null
  let gain = 0
  let loss = 0
  for (const s of samples) {
    if (!isNum(s.altM)) continue
    if (ref === null) { ref = s.altM; continue }
    const diff = s.altM - ref
    if (diff >= ELEVATION_HYSTERESIS_M) { gain += diff; ref = s.altM }
    else if (-diff >= ELEVATION_HYSTERESIS_M) { loss += -diff; ref = s.altM }
  }
  return { gainM: gain, lossM: loss }
}

/** Nur Punkte mit Distanz, Distanz nie rückwärts (GPS-Sprünge werden übersprungen). */
function monotonicByDistance(samples: readonly Sample[]): (Sample & { distKm: number })[] {
  const out: (Sample & { distKm: number })[] = []
  let max = -Infinity
  for (const s of samples) {
    if (!isNum(s.distKm) || !isNum(s.tSec)) continue
    if (s.distKm < max) continue
    max = s.distKm
    out.push(s as Sample & { distKm: number })
  }
  return out
}

/** Pro volle km ein Split, plus Rest-Split (≥ 50 m). Dauer per linearer Interpolation an der km-Grenze. */
export function computeSplits(samples: readonly Sample[]): ActivitySplit[] {
  const pts = monotonicByDistance(samples)
  if (pts.length < 2) return []
  const totalKm = pts[pts.length - 1].distKm
  const firstT = pts[0].tSec

  // Zeit, zu der Distanz d erreicht wurde (erste Überschreitung; davor/danach geklemmt)
  const timeAt = (d: number): number => {
    if (d <= pts[0].distKm) return firstT
    if (d >= totalKm) return pts[pts.length - 1].tSec
    let lo = 0
    let hi = pts.length - 1 // pts[hi].distKm >= d, pts[lo].distKm < d
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (pts[mid].distKm >= d) hi = mid
      else lo = mid
    }
    const a = pts[lo]
    const b = pts[hi]
    return a.tSec + ((d - a.distKm) / (b.distKm - a.distKm)) * (b.tSec - a.tSec)
  }

  const fullKm = Math.floor(totalKm + 1e-9)
  const bounds: [number, number][] = []
  for (let k = 0; k < fullKm; k++) bounds.push([k, k + 1])
  if (totalKm - fullKm >= MIN_REST_SPLIT_KM) bounds.push([fullKm, totalKm])

  return bounds.map(([startKm, endKm], i): ActivitySplit => {
    const isLast = i === bounds.length - 1
    const inside = pts.filter(p => p.distKm >= startKm && (isLast ? p.distKm <= endKm : p.distKm < endKm))
    const distanceKm = endKm - startKm
    const durationSec = timeAt(endKm) - timeAt(startKm)
    const hrs = inside.map(p => p.hr).filter((h): h is number => isNum(h) && h > 0)
    const split: ActivitySplit = { splitIndex: i + 1, distanceKm, durationSec }
    if (durationSec > 0 && distanceKm > 0) split.paceSecPerKm = durationSec / distanceKm
    if (hrs.length > 0) split.avgHr = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)
    if (inside.some(p => isNum(p.altM))) {
      const el = elevation(inside)
      split.elevationGainM = el.gainM
      split.elevationLossM = el.lossM
    }
    return split
  })
}

/** Pace (s/km) je Punkt über ein gleitendes Fenster der letzten ~30 s; null ohne Bewegung oder > 20 min/km. */
function paceSeries(samples: readonly Sample[]): (number | null)[] {
  const out: (number | null)[] = new Array(samples.length).fill(null)
  let j = 0
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    if (!isNum(s.distKm)) continue
    while (j < i && samples[j].tSec < s.tSec - PACE_WINDOW_SEC) j++
    // Fensterbeginn: ältester Punkt im Fenster, der selbst eine Distanz hat
    let k = j
    while (k < i && !isNum(samples[k].distKm)) k++
    if (k >= i) continue
    const dt = s.tSec - samples[k].tSec
    const dd = s.distKm - (samples[k].distKm as number)
    if (dt <= 0 || dd <= 0) continue
    const pace = dt / dd
    if (pace > MAX_PACE_SEC_PER_KM) continue
    out[i] = pace
  }
  return out
}

const round = (v: number | null | undefined, digits: number): number | null =>
  isNum(v) ? Math.round(v * 10 ** digits) / 10 ** digits : null

/** Verläufe auf höchstens `max` Punkte verkleinern (gleichmäßig gewählt, erster und letzter Punkt bleiben). */
export function downsampleStreams(samples: readonly Sample[], max = 500): ActivityStreams {
  const clean = samples.filter(s => isNum(s.tSec))
  const pace = paceSeries(clean)
  const n = clean.length
  let idx: number[]
  if (n <= max) {
    idx = clean.map((_, i) => i)
  } else {
    idx = []
    for (let k = 0; k < max; k++) {
      const i = Math.round((k * (n - 1)) / (max - 1))
      if (idx[idx.length - 1] !== i) idx.push(i)
    }
  }
  return {
    t: idx.map(i => Math.round(clean[i].tSec)),
    distKm: idx.map(i => round(clean[i].distKm, 3)),
    hr: idx.map(i => (isNum(clean[i].hr) && (clean[i].hr as number) > 0 ? (clean[i].hr as number) : null)),
    paceSec: idx.map(i => round(pace[i], 0)),
    altM: idx.map(i => round(clean[i].altM, 1)),
  }
}
