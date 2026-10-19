/**
 * Leistungszahl und Leistungs-Check (Spec 4a, nach Runnas „Pace Insights“):
 * Leistung = 10-km-Zeit, die heute möglich wäre. Erst ein Muster über mehrere harte
 * Einheiten schlägt eine neue Leistung vor; Einzelläufe und Ausreißer verschieben nichts.
 */
import { addDaysStr } from '../planCalendar'
import { riegel } from '../coach/prognosis'
import type { AdaptResult, AdaptSession, CoachChange, RunFeedback } from './types'

export type PaceState = 'missing' | 'observing' | 'ok' | 'mixed' | 'faster' | 'slower'

export interface PaceCheck {
  state: PaceState
  used: number
  current10kSec: number | null
  new10kSec: number | null
}

const Q_MIN = 0.85
const Q_MAX = 1.2
const Q_FAST = 0.97
const Q_SLOW = 1.04
const STEP = 0.02
const LOOKBACK_DAYS = 27 // heute−27 … heute = 28 Tage

/** Beliebige Zeit/Distanz per Riegel auf eine 10-km-Zeit (Sekunden, gerundet). */
export function to10kSec(timeSec: number, distanceKm: number): number {
  return Math.round(riegel(timeSec, distanceKm, 10))
}

export function paceCheck(recent: RunFeedback[], current10kSec: number | null, since: string | null, today: string): PaceCheck {
  const none = { current10kSec, new10kSec: null }
  if (current10kSec == null) return { state: 'missing', used: 0, ...none }

  const from = addDaysStr(today, -LOOKBACK_DAYS)
  const valid = recent
    .filter(f => f.sessionHard && f.targetPaceFastSec && f.paceSec && f.date >= from && (since == null || f.date > since))
    .map(f => ({ f, q: (f.paceSec as number) / (f.targetPaceFastSec as number) }))
    .filter(x => x.q >= Q_MIN && x.q <= Q_MAX)
    .slice(-3)

  if (valid.length < 2) return { state: 'observing', used: valid.length, ...none }

  const fast = valid.filter(x => x.q <= Q_FAST && x.f.effort != null && x.f.effort <= 6).length
  const slow = valid.filter(x => x.q >= Q_SLOW && x.f.effort != null && x.f.effort >= 7).length
  const used = valid.length
  if (fast >= 2) return { state: 'faster', used, current10kSec, new10kSec: Math.round(current10kSec * (1 - STEP)) }
  if (slow >= 2) return { state: 'slower', used, current10kSec, new10kSec: Math.round(current10kSec * (1 + STEP)) }
  if (fast >= 1 && slow >= 1) return { state: 'mixed', used, ...none }
  return { state: 'ok', used, ...none }
}

/** Tempo-Ziele aller geplanten Einheiten ab heute mit `factor` skalieren (Einheiten bleiben gleich). */
export function scalePaces(sessions: AdaptSession[], today: string, factor: number): AdaptResult {
  const changes: CoachChange[] = []
  for (const s of sessions) {
    if (s.status !== 'planned' || s.date < today) continue
    if (s.targetPaceFastSec == null && s.targetPaceSlowSec == null) continue
    const set: { targetPaceFastSec?: number; targetPaceSlowSec?: number } = {}
    if (s.targetPaceFastSec != null) set.targetPaceFastSec = Math.round(s.targetPaceFastSec * factor)
    if (s.targetPaceSlowSec != null) set.targetPaceSlowSec = Math.round(s.targetPaceSlowSec * factor)
    changes.push({ action: 'update', sessionId: s.id, set })
  }
  if (changes.length === 0) return { changes, reasons: [] }
  const pct = Math.round(Math.abs(1 - factor) * 100)
  const text = factor < 1
    ? `Tempo-Ziele ${pct} % schneller – deine letzten Tempoläufe waren schneller als geplant und fühlten sich leicht an.`
    : `Tempo-Ziele ${pct} % langsamer – deine letzten Tempoläufe waren langsamer als geplant und schwer.`
  return { changes, reasons: [{ rule: 'PACE', text }] }
}
