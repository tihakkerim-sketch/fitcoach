/** Puls-Zonen nach Karvonen (Herzfrequenz-Reserve). Reine Logik, Main + Renderer. */
import type { HrBasics, ZoneDef } from './types'

const LABELS = ['Erholung', 'Grundlage', 'Tempo', 'Schwelle', 'VO2max']
const LOWER = [0.5, 0.6, 0.7, 0.8, 0.9]

/** 5 Zonen auf der Reserve (Max − Ruhe); lückenlos, ohne Überlappung. */
export function karvonenZones(maxHr: number, restHr: number): ZoneDef[] {
  const reserve = maxHr - restHr
  const mins = LOWER.map(p => Math.round(restHr + p * reserve))
  return mins.map((minHr, i) => ({
    zoneNumber: i + 1,
    minHr,
    maxHr: i < 4 ? mins[i + 1] - 1 : maxHr,
    label: LABELS[i],
  }))
}

/** Zone (1–5) zu einem Puls; unter Z1 oder über Z5 → null. */
export function zoneOf(hr: number, zones: ZoneDef[]): number | null {
  const z = zones.find(x => hr >= x.minHr && hr <= x.maxHr)
  return z ? z.zoneNumber : null
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function resolveHrBasics(input: {
  profileMaxHr?: number | null
  profileRestHr?: number | null
  observedMaxHr?: number | null
  recoveryRestHrs?: number[]
}): HrBasics | null {
  let maxHr: number
  let maxSource: HrBasics['maxSource']
  if (input.profileMaxHr && input.profileMaxHr > 0) {
    maxHr = input.profileMaxHr
    maxSource = 'profile'
  } else if (input.observedMaxHr && input.observedMaxHr > 0) {
    maxHr = input.observedMaxHr
    maxSource = 'observed'
  } else return null

  let restHr: number
  let restSource: HrBasics['restSource']
  const rec = (input.recoveryRestHrs ?? []).filter(x => x > 0)
  if (input.profileRestHr && input.profileRestHr > 0) {
    restHr = input.profileRestHr
    restSource = 'profile'
  } else if (rec.length > 0) {
    restHr = Math.round(median(rec))
    restSource = 'recovery'
  } else {
    restHr = 60
    restSource = 'default'
  }
  if (restHr >= maxHr) return null
  return { maxHr, restHr, maxSource, restSource }
}

/** Gespeicherte Zonen haben Vorrang, sonst berechnet, sonst keine. */
export function effectiveZones(
  saved: ZoneDef[],
  hr: HrBasics | null,
): { zones: ZoneDef[]; source: 'saved' | 'computed' | 'none' } {
  if (saved.length > 0) return { zones: saved, source: 'saved' }
  if (hr) return { zones: karvonenZones(hr.maxHr, hr.restHr), source: 'computed' }
  return { zones: [], source: 'none' }
}
