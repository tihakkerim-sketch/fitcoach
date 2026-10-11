/**
 * Coach-Antwort (JSON mit "fitcoachChanges") lesen, jede Änderung einzeln prüfen und
 * für die Vorschau aufbereiten (Titel, vorher/nachher, Fehler). Texte auf Deutsch.
 */
import { parseISO } from 'date-fns'
import type { PlanDetail, SessionRow } from '@/types/ipc'
import { coachChangeSchema, type CoachChange } from '@/types/ipcContract'
import { currentWeekIndex } from '@/shared/planCalendar'
import { DOW_SHORT, TYPE_LABEL, fmtDate, sessionTargetText } from '@/components/plans/sessionFormat'
import { optNum, optStr, parsePaceField, parseSteps } from '@/lib/planImport'

export const COACH_CHANGES_FORMAT = `Antworte mit Änderungen am Trainingsplan als EIN JSON-Objekt in genau diesem Format:

{
  "fitcoachChanges": 1,
  "summary": "Kurze Begründung der Änderungen",
  "changes": [
    { "action": "update", "sessionId": 123, "set": { "distanceKm": 8, "pace": "6:00-6:20" }, "reason": "…" },
    { "action": "move",   "sessionId": 124, "date": "2026-10-16", "reason": "…" },
    { "action": "remove", "sessionId": 125, "reason": "…" },
    { "action": "add",    "date": "2026-10-18", "session": { "type": "running", "title": "…", "distanceKm": 6 }, "reason": "…" }
  ]
}

Regeln:
- "sessionId" ist die Nummer aus dem Bericht (#123).
- Nur geplante Einheiten ab heute ändern; Daten als JJJJ-MM-TT, im Plan und nicht vor heute.
- Felder in "set" und "session" wie im Plan-JSON: type (running, cycling, strength, rest, custom), title, distanceKm, durationMin, pace ("5:30" oder "5:30-5:50", schneller Wert zuerst), hrZone (1 bis 5), steps, note. In "set" nur die Felder, die sich ändern; null löscht ein Feld.
- Gib NUR das JSON aus, in einem \`\`\`json-Block oder als reinen Text.`

export interface ChangeItem {
  index: number
  change: CoachChange | null
  reason: string | null
  title: string
  before: string | null
  after: string | null
  error: string | null
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

type Fields = Pick<SessionRow,
  'type' | 'title' | 'targetDistanceKm' | 'targetDurationMin' | 'targetPaceFastSec' | 'targetPaceSlowSec'
  | 'targetHrZone' | 'steps' | 'coachingNote'>

/** z. B. "10 km · 6:00–6:20/km · Z2"; ohne Ziele der Typ ("Lauf"). */
export function sessionSummary(f: Partial<Fields> & Pick<Fields, 'type'>): string {
  const text = sessionTargetText({
    targetDistanceKm: f.targetDistanceKm ?? null, targetDurationMin: f.targetDurationMin ?? null,
    targetPaceFastSec: f.targetPaceFastSec ?? null, targetPaceSlowSec: f.targetPaceSlowSec ?? null,
    targetHrZone: f.targetHrZone ?? null,
  })
  return text || TYPE_LABEL[f.type]
}

/** "Do 16.10." */
function dayLabel(date: string): string {
  const dow = (parseISO(`${date}T12:00:00`).getDay() + 6) % 7
  return `${DOW_SHORT[dow]} ${fmtDate(date, 'dd.MM.')}`
}

function labelFor(date: string, f: { type: SessionRow['type']; title?: string | null }): string {
  return `${dayLabel(date)} · ${f.title?.trim() || TYPE_LABEL[f.type]}`
}

/**
 * v2-Felder → App-Felder. `partial`: null heißt „Feld löschen" (sonst wird null ignoriert).
 * Wirft Error mit deutscher Meldung.
 */
function convertFields(raw: unknown, partial: boolean): Obj {
  if (!isObj(raw)) throw new Error(partial ? '"set" muss ein Objekt sein.' : '"session" muss ein Objekt sein.')
  const out: Obj = {}
  const put = (key: string, v: unknown) => {
    if (v === undefined) return
    out[key] = v
  }
  const has = (k: string) => k in raw && (partial || raw[k] !== null)
  const isNull = (k: string) => raw[k] === null

  if (has('type')) {
    if (typeof raw.type !== 'string') throw new Error('"type" muss ein Text sein.')
    out.type = raw.type
  }
  if (has('title')) put('title', isNull('title') ? null : optStr(raw.title, 'title', ''))
  if (has('note')) put('coachingNote', isNull('note') ? null : optStr(raw.note, 'note', ''))
  if (has('distanceKm')) put('targetDistanceKm', isNull('distanceKm') ? null : optNum(raw.distanceKm, 'distanceKm', ''))
  if (has('durationMin')) put('targetDurationMin', isNull('durationMin') ? null : optNum(raw.durationMin, 'durationMin', ''))
  if (has('hrZone')) put('targetHrZone', isNull('hrZone') ? null : optNum(raw.hrZone, 'hrZone', ''))
  if (has('pace')) {
    if (isNull('pace')) { out.targetPaceFastSec = null; out.targetPaceSlowSec = null }
    else {
      const pace = parsePaceField(raw.pace, '')
      if (pace) { out.targetPaceFastSec = pace.fast; out.targetPaceSlowSec = pace.slow }
    }
  }
  if (has('steps')) {
    if (isNull('steps')) out.steps = null
    else put('steps', parseSteps(raw.steps, ''))
  }
  return out
}

function extractJson(raw: string): unknown {
  const candidates: string[] = []
  for (const m of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.push(m[1])
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(raw.slice(first, last + 1))
  for (const c of candidates) {
    try { return JSON.parse(c.trim()) } catch { /* nächster Kandidat */ }
  }
  throw new Error('Das ist kein gültiges JSON. Bitte die komplette Antwort von Claude einfügen.')
}

const firstIssue = (e: { issues: { path: PropertyKey[]; message: string }[] }): string => {
  const i = e.issues[0]
  return i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message
}

export function parseCoachChanges(
  raw: string, plan: PlanDetail, today: string,
): { summary: string | null; items: ChangeItem[] } {
  const obj = extractJson(raw)
  if (!isObj(obj)) throw new Error('Das JSON muss ein Objekt sein.')
  if (!Array.isArray(obj.changes)) throw new Error('Es fehlt die Liste "changes" mit den Änderungen.')
  const summary = typeof obj.summary === 'string' && obj.summary.trim() ? obj.summary.trim() : null

  const sessions = new Map<number, SessionRow>()
  for (const w of plan.weeks) for (const s of w.sessions) sessions.set(s.id, s)

  const targetDate = (v: unknown): string => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(parseISO(`${v}T12:00:00`).getTime())) {
      throw new Error('Das Datum fehlt oder ist ungültig (Format JJJJ-MM-TT).')
    }
    if (v < today) throw new Error(`Das Datum ${fmtDate(v)} liegt in der Vergangenheit.`)
    const wi = currentWeekIndex(plan.startDate, v)
    if (wi < 0 || wi >= plan.weekCount) throw new Error(`Das Datum ${fmtDate(v)} liegt außerhalb des Plans.`)
    return v
  }

  const existing = (v: unknown): SessionRow => {
    if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error('"sessionId" fehlt oder ist keine Zahl.')
    const s = sessions.get(v)
    if (!s) throw new Error(`Einheit #${v} gibt es in diesem Plan nicht.`)
    if (s.status !== 'planned') {
      throw new Error(`Einheit #${v} ist bereits ${s.status === 'completed' ? 'erledigt' : 'übersprungen'} und kann nicht geändert werden.`)
    }
    if (s.date < today) throw new Error(`Einheit #${v} liegt in der Vergangenheit und kann nicht geändert werden.`)
    return s
  }

  const items = obj.changes.map((rawChange, index): ChangeItem => {
    const base: ChangeItem = { index, change: null, reason: null, title: `Änderung ${index + 1}`, before: null, after: null, error: null }
    try {
      if (!isObj(rawChange)) throw new Error('Die Änderung muss ein Objekt sein.')
      const reason = typeof rawChange.reason === 'string' && rawChange.reason.trim() ? rawChange.reason.trim() : null
      base.reason = reason
      const action = rawChange.action

      let candidate: unknown
      switch (action) {
        case 'update': {
          const s = existing(rawChange.sessionId)
          const set = convertFields(rawChange.set, true)
          if (Object.keys(set).length === 0) throw new Error('"set" enthält keine Änderung.')
          candidate = { action, sessionId: s.id, set }
          base.title = labelFor(s.date, s)
          base.before = sessionSummary(s)
          base.after = sessionSummary({ ...s, ...(set as Partial<Fields>) })
          break
        }
        case 'move': {
          const s = existing(rawChange.sessionId)
          const date = targetDate(rawChange.date)
          candidate = { action, sessionId: s.id, date }
          base.title = labelFor(s.date, s)
          base.before = dayLabel(s.date)
          base.after = dayLabel(date)
          break
        }
        case 'remove': {
          const s = existing(rawChange.sessionId)
          candidate = { action, sessionId: s.id }
          base.title = labelFor(s.date, s)
          base.before = sessionSummary(s)
          base.after = 'entfernt'
          break
        }
        case 'add': {
          const date = targetDate(rawChange.date)
          const session = convertFields(rawChange.session, false)
          if (!session.type) throw new Error('Bei "add" fehlt der Typ der Einheit.')
          candidate = { action, date, session }
          base.title = labelFor(date, session as { type: SessionRow['type']; title?: string | null })
          base.after = sessionSummary(session as Pick<Fields, 'type'>)
          break
        }
        default:
          throw new Error(`Unbekannte Aktion "${String(action)}" (erlaubt: update, move, remove, add).`)
      }

      const checked = coachChangeSchema.safeParse(candidate)
      if (!checked.success) throw new Error(firstIssue(checked.error))
      const c = checked.data
      if (c.action === 'update' || c.action === 'add') {
        const f = c.action === 'update' ? c.set : c.session
        const s = c.action === 'update' ? sessions.get(c.sessionId) : undefined
        const fast = f.targetPaceFastSec !== undefined ? f.targetPaceFastSec : s?.targetPaceFastSec
        const slow = f.targetPaceSlowSec !== undefined ? f.targetPaceSlowSec : s?.targetPaceSlowSec
        if (fast != null && slow != null && fast > slow) throw new Error('Pace: schneller Wert muss kleiner sein')
      }
      return { ...base, change: c }
    } catch (err) {
      return { ...base, change: null, before: null, after: null, error: err instanceof Error ? err.message : 'Ungültige Änderung.' }
    }
  })

  return { summary, items }
}
