/** Recovery-Trend: HRV, Ruhepuls, Schlaf – 7 Tage vs. 30 Tage. */
import { addDaysStr } from '../planCalendar'
import type { RecoveryTrend } from './types'

export interface RecoveryLogLite {
  date: string
  hrvRmssd?: number | null
  restingHr?: number | null
  sleepHours?: number | null
}

const r1 = (n: number): number => Math.round(n * 10) / 10

export function recoveryTrend(logs: RecoveryLogLite[], today: string): RecoveryTrend {
  const from7 = addDaysStr(today, -6)
  const from30 = addDaysStr(today, -29)
  const avg = (key: 'hrvRmssd' | 'restingHr' | 'sleepHours', from: string): number | null => {
    const vals = logs
      .filter(l => l.date >= from && l.date <= today)
      .map(l => l[key])
      .filter((v): v is number => typeof v === 'number' && v > 0)
    return vals.length ? r1(vals.reduce((s, v) => s + v, 0) / vals.length) : null
  }
  const todayHrv = logs.find(l => l.date === today)?.hrvRmssd
  const hrvToday = typeof todayHrv === 'number' && todayHrv > 0 ? todayHrv : null
  const hrv30 = avg('hrvRmssd', from30)
  return {
    hrvToday,
    hrv7: avg('hrvRmssd', from7),
    hrv30,
    rhr7: avg('restingHr', from7),
    rhr30: avg('restingHr', from30),
    sleep7: avg('sleepHours', from7),
    sleep30: avg('sleepHours', from30),
    hrvDeltaPct: hrvToday !== null && hrv30 ? Math.round(((hrvToday - hrv30) / hrv30) * 100) : null,
  }
}
