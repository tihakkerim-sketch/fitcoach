/**
 * Knopf „Nicht 100 %“ (Spec 4b, nach Runna): Plan für 1–7 Tage entschärfen,
 * danach geordnete Rückkehr. Ergebnis ist ein normaler Vorschlag.
 */
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { addDaysStr } from '../planCalendar'
import { applyGuards } from './guards'
import { easyVersion, isHard, restVersion, scaleVolume } from './sessions'
import type { AdaptInput, AdaptResult, AdaptSession, CoachChange, Reason } from './types'

export type NotFullReason = 'sick' | 'pain' | 'busy'

const day = (date: string) => format(new Date(`${date}T12:00:00`), 'EEEEEE', { locale: de })
const label = (s: AdaptSession) => s.title || (isHard(s) ? 'Harte Einheit' : 'Lauf')

export function notFullProposal(input: AdaptInput, reason: NotFullReason, days: number): AdaptResult {
  const { today, planEnd } = input
  const periodEnd = addDaysStr(today, Math.min(7, Math.max(1, days)) - 1)
  const open = input.sessions
    .filter(s => s.status === 'planned' && s.type !== 'rest' && s.date >= today && s.date <= planEnd)
    .sort((a, b) => a.date.localeCompare(b.date))
  const during = open.filter(s => s.date <= periodEnd)
  const after = open.filter(s => s.date > periodEnd)

  const changes: CoachChange[] = []
  const reasons: Reason[] = []
  const add = (s: AdaptSession, c: CoachChange, text: string) => {
    changes.push(c)
    reasons.push({ sessionId: s.id, rule: 'NOT_FULL', text })
  }
  const volume = (s: AdaptSession, text: string) =>
    add(s, { action: 'update', sessionId: s.id, set: scaleVolume(s, 0.7) }, text)

  if (reason === 'sick') {
    for (const s of during) add(s, restVersion(s), `Krank – ${label(s)} am ${day(s.date)} fällt aus (Ruhetag).`)
    for (const s of after.slice(0, 2)) {
      add(s, easyVersion(s, 0.7), `Rückkehr nach Krankheit – ${label(s)} am ${day(s.date)} locker und 30 % kürzer.`)
    }
  } else if (reason === 'pain') {
    for (const s of during) {
      if (isHard(s)) add(s, easyVersion(s, 0.7), `Beschwerden – ${label(s)} am ${day(s.date)} nur locker und 30 % kürzer.`)
      else volume(s, `Beschwerden – ${label(s)} am ${day(s.date)} 30 % kürzer.`)
    }
    const nextHard = after.find(isHard)
    if (nextHard) add(nextHard, easyVersion(nextHard, 1), `Nach den Beschwerden – ${label(nextHard)} am ${day(nextHard.date)} noch locker.`)
  } else {
    for (const s of during) volume(s, `Wenig Zeit – ${label(s)} am ${day(s.date)} 30 % kürzer.`)
  }

  return applyGuards(input, { changes, reasons }, { maxChanges: 10, unlimitedReduction: true })
}
