/**
 * Leitplanken: jede Änderung wird auf einer Kopie der Einheiten durchgespielt und verworfen,
 * wenn sie gegen die festen Grenzen verstößt. Verworfene Änderungen nehmen ihre Begründung mit.
 */
import { addDaysStr } from '../planCalendar'
import { isHard, plannedKm } from './sessions'
import type { AdaptInput, AdaptResult, AdaptSession, CoachChange } from './types'

export interface GuardOptions {
  maxChanges: number
  /** true = Umfang darf beliebig sinken (Beschwerden, „Nicht 100 %“). */
  unlimitedReduction: boolean
}

const MAX_VOLUME_CHANGE = 0.1

type Update = Extract<CoachChange, { action: 'update' }>['set']

function applyUpdate(s: AdaptSession, set: Update): AdaptSession {
  const next = { ...s }
  if (set.type !== undefined) next.type = set.type
  if (set.title !== undefined) next.title = set.title ?? null
  if (set.targetDistanceKm !== undefined) next.targetDistanceKm = set.targetDistanceKm ?? null
  if (set.targetDurationMin !== undefined) next.targetDurationMin = set.targetDurationMin ?? null
  if (set.targetPaceFastSec !== undefined) next.targetPaceFastSec = set.targetPaceFastSec ?? null
  if (set.targetPaceSlowSec !== undefined) next.targetPaceSlowSec = set.targetPaceSlowSec ?? null
  if (set.targetHrZone !== undefined) next.targetHrZone = set.targetHrZone ?? null
  if (set.steps !== undefined) next.hasSteps = !!set.steps && set.steps.length > 0
  return next
}

/** Wendet eine Änderung an; null = ungültig (Einheit nicht änderbar, Datum außerhalb). */
function simulate(sessions: AdaptSession[], c: CoachChange, today: string, planEnd: string): AdaptSession[] | null {
  if (c.action === 'add') {
    if (c.date < today || c.date > planEnd) return null
    return [...sessions, applyUpdate({
      id: -sessions.length - 1, date: c.date, type: c.session.type, title: null, targetDistanceKm: null,
      targetDurationMin: null, targetPaceFastSec: null, targetPaceSlowSec: null, targetHrZone: null,
      hasSteps: false, status: 'planned',
    }, c.session)]
  }
  const target = sessions.find(s => s.id === c.sessionId)
  if (!target || target.status !== 'planned' || target.date < today) return null
  if (c.action === 'remove') return sessions.filter(s => s.id !== c.sessionId)
  if (c.action === 'move') {
    if (c.date < today || c.date > planEnd) return null
    // nie zwei Einheiten an einem Tag
    if (sessions.some(o => o.id !== c.sessionId && o.date === c.date && o.type !== 'rest' && o.status !== 'skipped')) return null
    return sessions.map(s => (s.id === c.sessionId ? { ...s, date: c.date } : s))
  }
  return sessions.map(s => (s.id === c.sessionId ? applyUpdate(s, c.set) : s))
}

/** Gibt es einen harten Tag direkt neben einer harten Einheit? */
function backToBackHard(sessions: AdaptSession[], changedId: number | null, changedDate: string | null): boolean {
  if (changedId === null || changedDate === null) return false
  const self = sessions.find(s => s.id === changedId)
  if (!self || !isHard(self) || self.type === 'rest') return false
  const neighbours = [addDaysStr(changedDate, -1), addDaysStr(changedDate, 1)]
  return sessions.some(s => s.id !== changedId && s.status !== 'skipped' && s.type !== 'rest'
    && neighbours.includes(s.date) && isHard(s))
}

export function applyGuards(input: AdaptInput, r: AdaptResult, opts: GuardOptions): AdaptResult {
  const { today, planEnd } = input
  const windowEnd = addDaysStr(today, 6)
  const baseKm = plannedKm(input.sessions, today, windowEnd)
  let sessions = input.sessions
  const kept: CoachChange[] = []
  const dropped = new Set<number>()

  for (const c of r.changes) {
    const next = simulate(sessions, c, today, planEnd)
    const id = c.action === 'add' ? null : c.sessionId
    let ok = next !== null && kept.length < opts.maxChanges
    if (ok && next) {
      const moved = c.action === 'move' ? c.date : c.action === 'update' ? next.find(s => s.id === id)?.date ?? null : null
      const before = id === null ? null : sessions.find(s => s.id === id)?.date ?? null
      // nur neu entstehendes Nebeneinander verbieten (vom Plan vorgegebenes bleibt erlaubt)
      if (backToBackHard(next, id, moved) && !backToBackHard(sessions, id, before)) ok = false
      const km = plannedKm(next, today, windowEnd)
      if (baseKm > 0) {
        const delta = (km - baseKm) / baseKm
        if (delta > MAX_VOLUME_CHANGE + 1e-9) ok = false
        if (!opts.unlimitedReduction && delta < -MAX_VOLUME_CHANGE - 1e-9) ok = false
      }
    }
    if (ok && next) {
      sessions = next
      kept.push(c)
    } else if (id !== null) {
      dropped.add(id)
    }
  }

  const keptIds = new Set(kept.flatMap(c => (c.action === 'add' ? [] : [c.sessionId])))
  return {
    changes: kept,
    reasons: r.reasons.filter(x => x.sessionId === undefined || keptIds.has(x.sessionId) || !dropped.has(x.sessionId)),
  }
}
