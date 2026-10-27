/**
 * Plan-JSON v2 (Claude ↔ FitCoach): Einlesen, Prüfen mit deutschen Fehlermeldungen,
 * Umwandeln in die IPC-Payloads, Ausgeben für „Mit Claude anpassen" und die Prompts.
 * Erkennt auch das alte Phasen-Format (`phases[]` mit `weeks: n` und wiederkehrenden Einheiten).
 */
import type { CreatePlanPayload, PlanBlock, PlanDetail, SessionType } from '@/types/ipc'
import { dateString, sessionFieldsSchema, planWeekInputSchema } from '@/types/ipcContract'
import {
  currentWeekIndex, formatPace, parsePaceRange, planState,
} from '@/shared/planCalendar'

export type ParsedPlan = {
  name: string
  goalEvent: string | null
  goalDate: string | null
  startDate: string | null
  weeks: CreatePlanPayload['weeks']
}

type Week = CreatePlanPayload['weeks'][number]
type SessionInput = Week['sessions'][number]

const MAX_WEEKS = 52
const VALID_TYPES: SessionType[] = ['running', 'cycling', 'strength', 'rest', 'custom']
const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

const DAY_MAP: Record<string, number> = {
  mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 7,
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export class ImportError extends Error {}
const fail = (where: string, msg: string): never => {
  throw new ImportError(where ? `${where}: ${msg}` : msg)
}

/** Zahl oder fehlend; alles andere ist ein Fehler. */
export function optNum(v: unknown, field: string, where: string): number | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v)) return fail(where, `"${field}" muss eine Zahl sein.`)
  return v
}

export function optStr(v: unknown, field: string, where: string): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') return fail(where, `"${field}" muss ein Text sein.`)
  return v
}

export function parsePaceField(v: unknown, where: string): { fast: number; slow: number } | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const range = typeof v === 'string' ? parsePaceRange(v) : null
  if (!range) return fail(where, `Pace "${String(v)}" ist ungültig (Format 5:30 oder 5:30-5:50).`)
  return range
}

/** Beschreibende Pace ohne Zahl wie „locker, RPE 2“ ist ein Hinweis, keine Pace → in die Notiz. */
const isPaceText = (v: unknown): v is string => typeof v === 'string' && !/\d\s*:\s*\d/.test(v)
const joinNote = (note: string | undefined, extra: string) => note ? `${note} · ${extra}` : extra

function parseStep(raw: unknown, where: string): Obj {
  if (!isObj(raw)) return fail(where, 'Schritt muss ein Objekt sein.')
  const out: Obj = { kind: raw.kind }
  const distanceM = optNum(raw.distanceM, 'distanceM', where)
  const durationSec = optNum(raw.durationSec, 'durationSec', where)
  const hrZone = optNum(raw.hrZone, 'hrZone', where)
  const note = optStr(raw.note, 'note', where)
  if (distanceM !== undefined) out.distanceM = distanceM
  if (durationSec !== undefined) out.durationSec = durationSec
  if (hrZone !== undefined) out.hrZone = hrZone
  if (note !== undefined) out.note = note
  if (isPaceText(raw.pace) && raw.pace.trim()) {
    out.note = joinNote(note, raw.pace.trim())
    return out
  }
  const pace = parsePaceField(raw.pace, where)
  if (pace) { out.paceFastSec = pace.fast; out.paceSlowSec = pace.slow }
  else {
    const fast = optNum(raw.paceFastSec, 'paceFastSec', where)
    const slow = optNum(raw.paceSlowSec, 'paceSlowSec', where)
    if (fast !== undefined) out.paceFastSec = fast
    if (slow !== undefined) out.paceSlowSec = slow
  }
  return out
}

export function parseSteps(raw: unknown, where: string): unknown[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) return fail(where, '"steps" muss eine Liste sein.')
  return raw.map((item, i) => {
    const at = `${where}, Schritt ${i + 1}`
    if (isObj(item) && 'repeat' in item) {
      if (!Array.isArray(item.steps)) return fail(at, 'Wiederholung braucht eine Liste "steps".')
      return { repeat: item.repeat, steps: item.steps.map((st, j) => parseStep(st, `${at}.${j + 1}`)) }
    }
    return parseStep(item, at)
  })
}

/** Eine Einheit aus dem JSON (v2 oder altes Format) → geprüfte Einheit. */
function parseSession(raw: unknown, where: string): SessionInput {
  if (!isObj(raw)) return fail(where, 'Einheit muss ein Objekt sein.')

  const dayKey = typeof raw.day === 'string' ? raw.day.trim().toLowerCase().replace(/\.$/, '') : ''
  const dayOfWeek = DAY_MAP[dayKey]
  if (!dayOfWeek) return fail(where, `Tag "${String(raw.day)}" ist ungültig (${DAY_NAMES.join(', ')}).`)
  if (!VALID_TYPES.includes(raw.type as SessionType)) {
    return fail(where, `Typ "${String(raw.type)}" ist ungültig (${VALID_TYPES.join(', ')}).`)
  }

  const out: Obj = { dayOfWeek, type: raw.type }
  const title = optStr(raw.title ?? raw.label, 'title', where)
  const note = optStr(raw.note ?? raw.coachingNote, 'note', where)
  const distanceKm = optNum(raw.distanceKm, 'distanceKm', where)
  const durationMin = optNum(raw.durationMin, 'durationMin', where)
  const hrZone = optNum(raw.hrZone, 'hrZone', where)
  if (title !== undefined) out.title = title
  if (note !== undefined) out.coachingNote = note
  if (distanceKm !== undefined) out.targetDistanceKm = distanceKm
  if (durationMin !== undefined) out.targetDurationMin = durationMin
  if (hrZone !== undefined) out.targetHrZone = hrZone
  if (isPaceText(raw.pace) && raw.pace.trim()) {
    out.coachingNote = joinNote(note, `Tempo: ${raw.pace.trim()}`)
  } else {
    const pace = parsePaceField(raw.pace, where)
    if (pace) { out.targetPaceFastSec = pace.fast; out.targetPaceSlowSec = pace.slow }
  }
  const steps = parseSteps(raw.steps, where)
  if (steps) out.steps = steps

  const checked = sessionFieldsSchema.safeParse(out)
  if (!checked.success) {
    const issue = checked.error.issues[0]
    const field = issue.path.length ? `${issue.path.join('.')}: ` : ''
    return fail(where, `${field}${issue.message}`)
  }
  return checked.data
}

function parseSessions(raw: unknown, where: string): SessionInput[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return fail(where, '"sessions" muss eine Liste sein.')
  return raw.map((s, i) => parseSession(s, `${where}, Einheit ${i + 1}`))
}

function parseWeeksV2(rawWeeks: unknown[]): Week[] {
  return rawWeeks.map((rw, wi) => {
    const where = `Woche ${wi + 1}`
    if (!isObj(rw)) return fail(where, 'Woche muss ein Objekt sein.')
    return {
      phase: optStr(rw.phase, 'phase', where),
      notes: optStr(rw.notes, 'notes', where),
      sessions: parseSessions(rw.sessions, where),
    }
  })
}

/** Altes Format: jede Phase wiederholt ihre Einheiten `weeks`-mal. */
function parseLegacyPhases(phases: unknown[]): Week[] {
  const weeks: Week[] = []
  phases.forEach((phase, pi) => {
    const where = `Phase ${pi + 1}`
    if (!isObj(phase)) return fail(where, 'Phase muss ein Objekt sein.')
    const count = phase.weeks
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      return fail(where, '"weeks" muss eine ganze Zahl ab 1 sein.')
    }
    if (weeks.length + count > MAX_WEEKS) return fail('', `Ein Plan darf höchstens ${MAX_WEEKS} Wochen haben.`)
    const name = optStr(phase.name, 'name', where)
    const sessions = parseSessions(phase.sessions, where)
    for (let i = 0; i < count; i++) weeks.push({ phase: name, sessions: structuredClone(sessions) })
  })
  return weeks
}

/** Claude-JSON (v2 oder altes Format) lesen und prüfen. Wirft `Error` mit deutscher Meldung. */
export function parsePlanJson(raw: string): ParsedPlan {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  let obj: unknown
  try {
    obj = JSON.parse(cleaned)
  } catch {
    // Handy/Notizen ersetzen " oft durch typografische Anführungszeichen → nur dann umwandeln
    try {
      obj = JSON.parse(cleaned.replace(/[“”„‟″]/g, '"'))
    } catch {
      throw new Error('Das ist kein gültiges JSON. Bitte genau die Antwort von Claude einfügen (ohne zusätzlichen Text).')
    }
  }

  try {
    if (!isObj(obj)) return fail('', 'Das JSON muss ein Objekt sein.')
    if (typeof obj.name !== 'string' || !obj.name.trim()) return fail('', 'Das Feld "name" fehlt.')

    let weeks: Week[]
    if (Array.isArray(obj.weeks)) {
      if (obj.weeks.length === 0) return fail('', 'Der Plan enthält keine Wochen.')
      if (obj.weeks.length > MAX_WEEKS) return fail('', `Ein Plan darf höchstens ${MAX_WEEKS} Wochen haben.`)
      weeks = parseWeeksV2(obj.weeks)
    } else if (Array.isArray(obj.phases)) {
      if (obj.phases.length === 0) return fail('', 'Der Plan enthält keine Phasen.')
      weeks = parseLegacyPhases(obj.phases)
    } else {
      return fail('', 'Es fehlt die Liste "weeks" (Wochen).')
    }

    const checkedWeeks = weeks.map((w, i) => {
      const r = planWeekInputSchema.safeParse(w)
      if (!r.success) return fail(`Woche ${i + 1}`, r.error.issues[0].message)
      return r.data
    })

    const date = (v: unknown, field: string): string | null => {
      if (v === undefined || v === null || v === '') return null
      if (typeof v !== 'string' || !dateString.safeParse(v).success) {
        return fail('', `"${field}" ist kein gültiges Datum (Format JJJJ-MM-TT).`)
      }
      return v
    }

    return {
      name: obj.name.trim(),
      goalEvent: optStr(obj.goalEvent, 'goalEvent', '') ?? null,
      goalDate: date(obj.goalDate, 'goalDate'),
      startDate: date(obj.startDate, 'startDate'),
      weeks: checkedWeeks,
    }
  } catch (err) {
    // ImportError ist schon deutsch und mit Position; alles Unerwartete bekommt eine allgemeine Meldung
    if (err instanceof ImportError) throw new Error(err.message)
    throw new Error('Der Plan konnte nicht gelesen werden.')
  }
}

/** Geparsten Plan + gewähltes Startdatum → Payload für `PLANS_CREATE` / `PLANS_ADAPT`. */
export function toCreatePayload(p: ParsedPlan, startDate: string): CreatePlanPayload {
  return { name: p.name, goalEvent: p.goalEvent, goalDate: p.goalDate, startDate, weeks: p.weeks }
}

/** Kennzahlen für die Vorschau. */
export function planStats(plan: ParsedPlan) {
  return {
    totalWeeks: plan.weeks.length,
    totalSessions: plan.weeks.reduce((sum, w) => sum + w.sessions.length, 0),
  }
}

// ── Ausgabe: Plan → JSON v2 ──────────────────────────────────────────────────

const paceText = (fast?: number | null, slow?: number | null): string | undefined => {
  const f = fast ?? slow
  const s = slow ?? fast
  if (f == null || s == null) return undefined
  return f === s ? formatPace(f) : `${formatPace(f)}-${formatPace(s)}`
}

const compact = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null))

function blockToJson(b: PlanBlock): Record<string, unknown> {
  if ('repeat' in b) return { repeat: b.repeat, steps: b.steps.map(blockToJson) }
  return compact({
    kind: b.kind, distanceM: b.distanceM, durationSec: b.durationSec,
    pace: paceText(b.paceFastSec, b.paceSlowSec), hrZone: b.hrZone, note: b.note,
  })
}

/** Plan im Claude-Format v2 (Pace als Text), z. B. für den „Anpassen"-Prompt. */
export function planToJsonV2(plan: PlanDetail): string {
  return JSON.stringify({
    version: 2,
    name: plan.name,
    ...compact({ goalEvent: plan.goalEvent, goalDate: plan.goalDate }),
    startDate: plan.startDate,
    weeks: plan.weeks.map(w => ({
      ...compact({ phase: w.phase, notes: w.notes }),
      sessions: w.sessions.map(s => compact({
        day: DAY_NAMES[s.dayOfWeek - 1], type: s.type, title: s.title,
        distanceKm: s.targetDistanceKm, durationMin: s.targetDurationMin,
        pace: paceText(s.targetPaceFastSec, s.targetPaceSlowSec), hrZone: s.targetHrZone,
        steps: s.steps && s.steps.length ? s.steps.map(blockToJson) : undefined,
        note: s.coachingNote,
      })),
    })),
  }, null, 2)
}

// ── Prompts (Deutsch) ─────────────────────────────────────────────────────────

const FORMAT_BLOCK = `{
  "version": 2,
  "name": "Name des Plans",
  "goalEvent": "Wettkampf oder Ziel (optional)",
  "goalDate": "JJJJ-MM-TT (optional)",
  "startDate": "JJJJ-MM-TT (ein Montag)",
  "weeks": [
    {
      "phase": "Grundlage",
      "notes": "Hinweis zur Woche (optional)",
      "sessions": [
        {
          "day": "Di",
          "type": "running",
          "title": "Intervalle 6 x 800 m",
          "distanceKm": 10,
          "durationMin": 60,
          "pace": "5:30-5:50",
          "hrZone": 2,
          "steps": [
            { "kind": "warmup", "durationSec": 900 },
            { "repeat": 6, "steps": [
              { "kind": "work", "distanceM": 800, "pace": "4:50-4:55" },
              { "kind": "recovery", "distanceM": 400 }
            ] },
            { "kind": "cooldown", "durationSec": 600 }
          ],
          "note": "Kurzer Coaching-Hinweis (optional)"
        }
      ]
    }
  ]
}`

const FORMAT_RULES = `Regeln für das JSON:
- Gib NUR das JSON aus: kein Text davor oder danach, keine Markdown-Zäune.
- Ein Eintrag pro Woche in "weeks" (keine Abkürzungen wie "Woche 1-4 gleich"). Höchstens 52 Wochen.
- Eine Woche beginnt am Montag; "startDate" muss ein Montag sein.
- "day": Mo, Di, Mi, Do, Fr, Sa oder So.
- "type": running, cycling, strength, rest oder custom.
- Alle Felder außer "day" und "type" sind optional. "hrZone" ist 1 bis 5.
- "pace" ist Minuten pro Kilometer als "5:30" oder als Bereich "5:30-5:50" (schneller Wert zuerst, Sekunden unter 60).
- "distanceKm" und "durationMin" sind die Gesamtwerte der Einheit (inklusive Aufwärmen und Auslaufen).
- "steps" nur bei Intervall- oder Tempoeinheiten. "kind" ist warmup, work, recovery oder cooldown. Strecke als "distanceM" (Meter) oder Zeit als "durationSec" (Sekunden), Pace als Text in "pace". Wiederholungen als { "repeat": 6, "steps": [...] } (eine Ebene, keine Verschachtelung darin).
- Plane Entlastungswochen ein (z. B. jede 3. oder 4. Woche weniger Umfang) und ein Tapering vor dem Wettkampf.
- Tage ohne Training weglassen oder als "rest" eintragen.`

export const CLAUDE_IMPORT_PROMPT = `Erstelle mir einen Trainingsplan und gib ihn als EIN JSON-Objekt in genau diesem Format aus:

${FORMAT_BLOCK}

${FORMAT_RULES}

Meine Angaben (bitte vor dem Absenden ausfüllen: Ziel, Startdatum, Trainingstage, Verletzungen):
- Ziel / Wettkampf und Datum: …
- Startdatum (Montag): …
- Trainingstage pro Woche und feste Ruhetage: …
- Verletzungen oder Einschränkungen: …
- Aktuelle Form (z. B. Wochenkilometer, letzte Bestzeit): …`

/** Prompt zum Anpassen des laufenden Plans: aktueller Plan als JSON v2 + Hinweis auf die aktuelle Woche. */
export function buildAdaptPrompt(plan: PlanDetail, today: string): string {
  const state = planState(plan.startDate, plan.weekCount, today)
  const weekHint = state === 'running'
    ? `Heute ist der ${today}; Woche ${currentWeekIndex(plan.startDate, today) + 1} ist die aktuelle. Lass vergangene Wochen unverändert und passe nur die aktuelle und die kommenden Wochen an.`
    : state === 'before'
      ? `Der Plan beginnt erst am ${plan.startDate}; alle Wochen dürfen angepasst werden.`
      : `Der Plan ist am ${today} bereits beendet; lass vergangene Wochen unverändert.`

  return `Ich folge dem folgenden Trainingsplan und möchte ihn anpassen. Gib den ANGEPASSTEN Plan als EIN JSON-Objekt im selben Format aus (alle Wochen, nicht nur die geänderten).

Aktueller Plan:
${planToJsonV2(plan)}

${weekHint}
Meine erledigten Einheiten bleiben automatisch erhalten, solange Woche, Tag und Typ im neuen Plan gleich bleiben. Behalte "startDate" bei, wenn ich nichts anderes sage.

${FORMAT_RULES}

Was soll sich ändern (bitte ausfüllen)?
- …`
}
