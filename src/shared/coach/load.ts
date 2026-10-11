/** Trainingsbelastung (Banister-TRIMP) und Fitness/Ermüdung/Form (CTL/ATL/TSB). */
import { addDaysStr } from '../planCalendar'
import type { CoachActivity, FormLevel, HrBasics, LoadPoint } from './types'

const r1 = (n: number): number => Math.round(n * 10) / 10

export function activityTrimp(a: CoachActivity, hr: HrBasics | null): number {
  if (a.type === 'sleep' || !a.durationMin || a.durationMin <= 0) return 0
  let hrr: number
  if (a.avgHr && hr) hrr = (a.avgHr - hr.restHr) / (hr.maxHr - hr.restHr)
  else if (a.perceivedEffort) hrr = 0.35 + 0.05 * a.perceivedEffort
  else hrr = 0.6
  hrr = Math.min(1, Math.max(0, hrr))
  return r1(a.durationMin * hrr * 0.64 * Math.exp(1.92 * hrr))
}

/** Ein Punkt pro Tag von..bis (inkl.); EWMA startet bei 0 am ersten Tag. */
export function loadSeries(acts: CoachActivity[], hr: HrBasics | null, from: string, to: string): LoadPoint[] {
  const perDay = new Map<string, number>()
  for (const a of acts) {
    if (a.date < from || a.date > to) continue
    perDay.set(a.date, (perDay.get(a.date) ?? 0) + activityTrimp(a, hr))
  }
  const out: LoadPoint[] = []
  let ctl = 0
  let atl = 0
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    const load = perDay.get(d) ?? 0
    const tsb = out.length === 0 ? 0 : ctl - atl // Werte von gestern
    ctl = ctl + (load - ctl) / 42
    atl = atl + (load - atl) / 7
    out.push({ date: d, load: r1(load), ctl: r1(ctl), atl: r1(atl), tsb: r1(tsb) })
  }
  return out
}

export function formLevel(tsb: number): FormLevel {
  if (tsb > 5) return 'fresh'
  if (tsb >= -10) return 'neutral'
  if (tsb >= -30) return 'building'
  return 'overload'
}

export const FORM_TEXT: Record<FormLevel, string> = {
  fresh: 'frisch',
  neutral: 'ausgeglichen',
  building: 'Aufbau (müde)',
  overload: 'Überlastungsgefahr',
}
