/**
 * Regeln nach einem Lauf (Spec Abschnitt 4): R1 Beschwerden, R2 lockerer Lauf zu hart,
 * R3 Erholung schlecht, R4 Steigerung nach leichten Läufen, R6 Hinweis auf Ausgelassenes.
 * Pro Einheit höchstens eine Regel; Reihenfolge = Priorität.
 */
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { addDaysStr } from '../planCalendar'
import { applyGuards } from './guards'
import { easyVersion, inWindow, isHard, plannedKm, restVersion, scaleVolume } from './sessions'
import type { AdaptInput, AdaptResult, AdaptSession, CoachChange, Reason, RunFeedback } from './types'

const day = (date: string) => format(new Date(`${date}T12:00:00`), 'EEEEEE', { locale: de })
const label = (s: AdaptSession) => s.title || (isHard(s) ? 'harte Einheit' : 'Lauf')

/** Darf `s` auf `date` liegen: Tag frei und kein harter Nachbartag? */
function canMoveTo(input: AdaptInput, s: AdaptSession, date: string): boolean {
  if (date > input.planEnd) return false
  const near = [addDaysStr(date, -1), addDaysStr(date, 1)]
  return !input.sessions.some(o => o.id !== s.id && o.status !== 'skipped' && o.type !== 'rest'
    && (o.date === date || (near.includes(o.date) && isHard(o))))
}

/** Lockerer Lauf deutlich zu hart (Anstrengung oder Puls über der Zielzone)? */
function tooHard(run: RunFeedback): boolean {
  if (run.sessionHard) return false
  const hrOver = run.avgHr != null && run.zoneMaxHr != null && run.avgHr > run.zoneMaxHr
  return (run.effort ?? 0) >= 8 || hrOver
}

function tooHardWhy(run: RunFeedback): string {
  if ((run.effort ?? 0) >= 8) return `mit ${run.effort}/10 zu hart`
  return `mit Ø-Puls ${run.avgHr} über der Zielzone`
}

export function adaptAfterRun(input: AdaptInput, run: RunFeedback): AdaptResult {
  const { today } = input
  const tomorrow = addDaysStr(today, 1)
  const changes: CoachChange[] = []
  const reasons: Reason[] = []
  const touched = new Set<number>()
  const window = input.sessions.filter(s => inWindow(s, today) && s.type !== 'rest')
    .sort((a, b) => a.date.localeCompare(b.date))
  const add = (s: AdaptSession, c: CoachChange, r: Omit<Reason, 'sessionId'>) => {
    changes.push(c)
    reasons.push({ sessionId: s.id, ...r })
    touched.add(s.id)
  }

  // R1 – Beschwerden (auch von einem Lauf gestern, falls dessen Vorschlag inzwischen ersetzt wurde)
  let r1 = false
  const yesterday = addDaysStr(today, -1)
  if (run.pain || input.recent.some(f => f.pain && f.date >= yesterday)) {
    for (const s of window.filter(x => isHard(x) && x.date <= tomorrow)) {
      r1 = true
      if (s.date === tomorrow) {
        add(s, restVersion(s), { rule: 'R1', text: `Du hast Beschwerden angegeben – ${label(s)} am ${day(s.date)} wird zum Ruhetag.` })
      } else {
        add(s, easyVersion(s, 0.7), { rule: 'R1', text: `Du hast Beschwerden angegeben – ${label(s)} am ${day(s.date)} nur locker und 30 % kürzer.` })
      }
    }
  }

  // R2 – lockerer Lauf zu hart
  let r2 = false
  if (tooHard(run)) {
    const next = window.find(x => isHard(x) && !touched.has(x.id))
    if (next) {
      r2 = true
      const why = `Dein lockerer Lauf am ${day(run.date)} war ${tooHardWhy(run)}`
      const moveTo = addDaysStr(next.date, 1)
      if (next.date <= tomorrow && canMoveTo(input, next, moveTo)) {
        add(next, { action: 'move', sessionId: next.id, date: moveTo },
          { rule: 'R2', text: `${why} – ${label(next)} einen Tag später (${day(moveTo)}).` })
      } else {
        add(next, { action: 'update', sessionId: next.id, set: scaleVolume(next, 0.9) },
          { rule: 'R2', text: `${why} – ${label(next)} am ${day(next.date)} 10 % kürzer.` })
      }
    }
  }

  // R3 – Erholung schlecht
  let r3 = false
  if (input.recoveryBad) {
    for (const s of window.filter(x => isHard(x) && x.date <= tomorrow && !touched.has(x.id))) {
      r3 = true
      const moveTo = addDaysStr(s.date, 1)
      if (canMoveTo(input, s, moveTo)) {
        add(s, { action: 'move', sessionId: s.id, date: moveTo },
          { rule: 'R3', text: `Deine Erholung ist gerade schlecht – ${label(s)} einen Tag später (${day(moveTo)}).` })
      } else {
        add(s, easyVersion(s, 1), { rule: 'R3', text: `Deine Erholung ist gerade schlecht – ${label(s)} am ${day(s.date)} nur locker.` })
      }
    }
  }

  // R4 – drei leichte Läufe hintereinander → langer Lauf etwas länger
  if (!r1 && !r2 && !r3 && !input.recoveryBad) {
    const last3 = input.recent.slice(-3)
    const easy = last3.length === 3 && last3.every(f => f.effort != null && f.effort <= 4
      && f.avgHr != null && f.zoneMaxHr != null && f.avgHr <= f.zoneMaxHr)
    const longest = window.filter(x => x.type === 'running' && x.targetDistanceKm != null && !touched.has(x.id))
      .sort((a, b) => (b.targetDistanceKm ?? 0) - (a.targetDistanceKm ?? 0))[0]
    if (easy && longest) {
      const set = scaleVolume(longest, 1.1)
      const extra = (set.targetDistanceKm ?? 0) - (longest.targetDistanceKm ?? 0)
      const after = plannedKm(input.sessions, today, addDaysStr(today, 6)) + extra
      if (input.avgWeekKmPrev28 > 0 && after <= 1.1 * input.avgWeekKmPrev28 + 1e-9) {
        add(longest, { action: 'update', sessionId: longest.id, set },
          { rule: 'R4', text: `Deine letzten 3 Läufe waren locker und leicht – ${label(longest)} am ${day(longest.date)} 10 % länger.` })
      }
    }
  }

  // R6 – Ausgelassenes der letzten 7 Tage: nur Hinweis
  const weekAgo = addDaysStr(today, -7)
  for (const s of input.sessions) {
    const missed = s.status === 'skipped' || (s.status === 'planned' && s.date < today)
    if (missed && s.type !== 'rest' && s.date >= weekAgo && s.date < today) {
      reasons.push({ rule: 'R6', text: `${label(s)} am ${day(s.date)} ausgelassen – wird nicht nachgeholt, der Plan läuft normal weiter.` })
    }
  }

  return applyGuards(input, { changes, reasons }, { maxChanges: 5, unlimitedReduction: r1 })
}
