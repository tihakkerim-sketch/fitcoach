/** Typen der Plan-Auto-Anpassung. Reine Daten, ohne DB und ohne „jetzt“. */
import type { CoachChange } from '../../types/ipcContract'

export type { CoachChange }

/** Plan-Einheit mit berechnetem Datum. */
export interface AdaptSession {
  id: number
  date: string // YYYY-MM-DD
  type: string
  title: string | null
  targetDistanceKm: number | null
  targetDurationMin: number | null
  targetPaceFastSec: number | null
  targetPaceSlowSec: number | null
  targetHrZone: number | null
  hasSteps: boolean
  status: 'planned' | 'completed' | 'skipped'
}

/** Ein zugeordneter Lauf samt Feedback und Soll-Werten der Einheit. */
export interface RunFeedback {
  activityId: number
  date: string
  sessionId: number | null
  sessionHard: boolean
  effort: number | null // 1–10
  pain: boolean
  avgHr: number | null
  zoneMinHr: number | null
  zoneMaxHr: number | null
  paceSec: number | null // s/km
  targetPaceFastSec: number | null
  distanceKm: number | null
}

export interface AdaptInput {
  today: string
  planEnd: string // letzter Tag des Plans
  /** Alle Einheiten von heute−1 bis heute+13 (Nachbartage für die Leitplanken). */
  sessions: AdaptSession[]
  /** Zugeordnete Läufe der letzten 28 Tage, ältester zuerst. */
  recent: RunFeedback[]
  recoveryBad: boolean
  avgWeekKmPrev28: number
}

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R6' | 'PACE' | 'NOT_FULL'

export interface Reason {
  sessionId?: number
  rule: RuleId
  text: string
}

export interface AdaptResult {
  changes: CoachChange[]
  reasons: Reason[]
}
