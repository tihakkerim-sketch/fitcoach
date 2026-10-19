/** Ergebnis-Typen der Plan-Anpassung, die Main und Renderer teilen (IPC). */
import type { PaceCheck } from './pace'
import type { CoachChange, Reason } from './types'

export type ProposalKind = 'run' | 'pace' | 'not_full'

export interface ProposalView {
  id: number
  kind: ProposalKind
  createdAt: number
  changes: CoachChange[]
  reasons: Reason[]
  meta: Record<string, unknown>
}

export interface PendingFeedback {
  activityId: number
  date: string
  sessionTitle: string | null
  distanceKm: number | null
  /** schon gespeicherte Werte (z. B. aus dem Eintrage-Dialog) als Startwerte */
  effort: number | null
  notes: string | null
}

export type PaceStatusView = PaceCheck & { suggested10kSec: number | null; history: { at: number; sec: number }[] }
