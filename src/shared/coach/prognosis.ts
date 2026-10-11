/** Wettkampf-Prognose nach Riegel aus aktuellen Läufen. */
import { addDaysStr } from '../planCalendar'
import type { CoachActivity, Prognosis, PrognosisStatus } from './types'

/** T2 = T1 · (D2/D1)^exp */
export function riegel(sec: number, fromKm: number, toKm: number, exp = 1.06): number {
  return sec * Math.pow(toKm / fromKm, exp)
}

/** "4:00" (h:mm), "3:59:30", "4h", "4h 10m", "sub 4" → Sekunden; sonst null. */
export function parseGoalTime(s: string | null | undefined): number | null {
  if (!s) return null
  const t = s.trim().toLowerCase().replace(/^sub\s*/, '')
  let m = /^(\d{1,2}):(\d{2}):(\d{2})(?:\s*h)?$/.exec(t)
  if (m) {
    if (+m[2] > 59 || +m[3] > 59) return null
    return +m[1] * 3600 + +m[2] * 60 + +m[3]
  }
  m = /^(\d{1,2}):(\d{2})(?:\s*h)?$/.exec(t)
  if (m) {
    if (+m[2] > 59) return null
    return +m[1] * 3600 + +m[2] * 60
  }
  m = /^(\d{1,2})(?:\s*h(?:\s*(\d{1,2})\s*(?:m|min)?)?)?$/.exec(t)
  if (m) {
    const min = m[2] ? +m[2] : 0
    if (min > 59) return null
    return +m[1] * 3600 + min * 60
  }
  return null
}

export function goalDistance(goalEvent: string | null | undefined): { km: number; label: string } {
  const t = (goalEvent ?? '').toLowerCase()
  if (/halb|half|\bhm\b/.test(t)) return { km: 21.0975, label: 'Halbmarathon' }
  if (t.includes('marathon')) return { km: 42.195, label: 'Marathon' }
  const m = /(\d+(?:[.,]\d+)?)\s*k(m)?/.exec(t)
  if (m) {
    const km = Number(m[1].replace(',', '.'))
    if (km > 0) return { km, label: `${m[1]} km` }
  }
  return { km: 42.195, label: 'Marathon' }
}

/** 14292 → "3:58:12" */
export function formatDuration(sec: number): string {
  const total = Math.round(sec)
  const h = Math.floor(total / 3600)
  const mi = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function predictRace(
  acts: CoachActivity[],
  today: string,
  target: { km: number; label: string },
  goalSec: number | null,
): Prognosis | null {
  const from = addDaysStr(today, -83)
  let best: { pred: number; a: CoachActivity } | null = null
  for (const a of acts) {
    if (a.type !== 'running' || (a.distanceKm ?? 0) < 5 || (a.durationMin ?? 0) <= 0) continue
    if (a.date < from || a.date > today) continue
    const pred = riegel(a.durationMin! * 60, a.distanceKm!, target.km)
    if (!best || pred < best.pred) best = { pred, a }
  }
  if (!best) return null
  const predictedSec = Math.round(best.pred)
  let status: PrognosisStatus
  if (goalSec === null) status = 'noGoal'
  else if (predictedSec <= goalSec) status = 'onTrack'
  else if (predictedSec <= goalSec * 1.05) status = 'close'
  else status = 'offTrack'
  return {
    targetKm: target.km,
    targetLabel: target.label,
    predictedSec,
    basedOn: {
      date: best.a.date,
      distanceKm: best.a.distanceKm!,
      durationSec: Math.round(best.a.durationMin! * 60),
    },
    goalSec,
    status,
    requiredPaceSec: goalSec === null ? null : Math.round(goalSec / target.km),
    predictedPaceSec: Math.round(predictedSec / target.km),
  }
}
