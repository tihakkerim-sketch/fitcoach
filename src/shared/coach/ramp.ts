/** Steigerungswarnungen (Wochen-km, längster Lauf, Plan, Belastungsverhältnis). */
import { addDaysStr, mondayOf } from '../planCalendar'
import type { CoachActivity, RampInfo, RampWarning, WarningLevel } from './types'

const r1 = (n: number): number => Math.round(n * 10) / 10

/** 42 → "42", 12.5 → "12,5" */
const fmtKm = (n: number): string => String(r1(n)).replace('.', ',')

function level(ratio: number): WarningLevel | null {
  if (ratio > 1.3) return 'warn'
  if (ratio > 1.1) return 'info'
  return null
}

export function rampInfo(acts: CoachActivity[], today: string, plannedNext7Km: number | null): RampInfo {
  const runs = acts.filter(a => a.type === 'running' && (a.distanceKm ?? 0) > 0)
  const l7From = addDaysStr(today, -6)
  const p28From = addDaysStr(today, -34)
  const p28To = addDaysStr(today, -7)
  const last7 = runs.filter(a => a.date >= l7From && a.date <= today)
  const prev28 = runs.filter(a => a.date >= p28From && a.date <= p28To)
  const sum = (xs: CoachActivity[]): number => xs.reduce((s, a) => s + (a.distanceKm ?? 0), 0)
  const longest = (xs: CoachActivity[]): number => xs.reduce((m, a) => Math.max(m, a.distanceKm ?? 0), 0)

  const last7Km = sum(last7)
  const avg = sum(prev28) / 4
  const longestLast7 = longest(last7)
  const longestPrev = longest(prev28)
  const weeks = new Set(prev28.map(a => mondayOf(a.date))).size
  const basisOk = avg >= 10 && weeks >= 3

  const warnings: RampWarning[] = []
  if (basisOk) {
    const lv = level(last7Km / avg)
    if (lv) {
      const pct = Math.round((last7Km / avg - 1) * 100)
      warnings.push({
        kind: 'weeklyKm',
        level: lv,
        percent: pct,
        text: `Letzte 7 Tage ${fmtKm(last7Km)} km = +${pct} % gegenüber deinem Schnitt (${fmtKm(avg)} km/Woche). Mehr als 10 % pro Woche erhöht das Verletzungsrisiko (Wade).`,
      })
    }
    if (longestPrev >= 5) {
      const lv2 = level(longestLast7 / longestPrev)
      if (lv2) {
        const pct = Math.round((longestLast7 / longestPrev - 1) * 100)
        warnings.push({
          kind: 'longRun',
          level: lv2,
          percent: pct,
          text: `Längster Lauf ${fmtKm(longestLast7)} km = +${pct} % gegenüber den 4 Wochen davor (${fmtKm(longestPrev)} km).`,
        })
      }
    }
    if (plannedNext7Km !== null) {
      const lv3 = level(plannedNext7Km / avg)
      if (lv3) {
        const pct = Math.round((plannedNext7Km / avg - 1) * 100)
        warnings.push({
          kind: 'plannedWeek',
          level: lv3,
          percent: pct,
          text: `Plan für die nächsten 7 Tage: ${fmtKm(plannedNext7Km)} km = +${pct} % gegenüber deinem Schnitt.`,
        })
      }
    }
  }

  return {
    last7Km: r1(last7Km),
    avgWeekKmPrev28: r1(avg),
    longestLast7Km: r1(longestLast7),
    longestPrev28Km: r1(longestPrev),
    plannedNext7Km,
    warnings,
  }
}

/** Akut/chronisch-Verhältnis: ATL/CTL > 1,5 (bei CTL ≥ 10) → Warnung. */
export function acwrWarning(ctl: number, atl: number): RampWarning | null {
  if (ctl < 10) return null
  const ratio = atl / ctl
  if (ratio <= 1.5) return null
  const txt = (Math.round(ratio * 10) / 10).toFixed(1).replace('.', ',')
  return {
    kind: 'acwr',
    level: 'warn',
    percent: Math.round((ratio - 1) * 100),
    text: `Belastung der letzten Woche ist ${txt}× so hoch wie dein Langzeitschnitt.`,
  }
}
