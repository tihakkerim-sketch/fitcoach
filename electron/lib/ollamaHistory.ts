/**
 * Verlauf des lokalen Coaches (letzte Antworten, neueste zuerst). Ohne `electron`-Import.
 */
import type { LocalCoachResult } from '../../src/types/ipc'
import { validateLocalCoachResult } from './ollamaPrompt'

export const HISTORY_MAX = 10

/** Gespeicherten Verlauf lesen; kaputtes JSON → [], ungültige Einträge fallen einzeln weg. */
export function parseStoredHistory(raw: string | null): LocalCoachResult[] {
  if (!raw) return []
  try {
    const list: unknown = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.map(validateLocalCoachResult).filter((r): r is LocalCoachResult => r !== null)
  } catch {
    return []
  }
}

export function appendHistory(history: LocalCoachResult[], result: LocalCoachResult, max = HISTORY_MAX): LocalCoachResult[] {
  return [result, ...history].slice(0, max)
}

/** Vermerkt `appliedAt` beim Eintrag mit diesem `createdAt`. */
export function markHistoryApplied(history: LocalCoachResult[], createdAt: string, appliedAt: string): LocalCoachResult[] {
  return history.map(h => (h.createdAt === createdAt ? { ...h, appliedAt } : h))
}
