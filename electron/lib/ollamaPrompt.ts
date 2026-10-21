/**
 * Prompt und Antwort-Prüfung für den lokalen Coach (Ollama). Ohne `electron`-Import.
 */
import { z } from 'zod'
import { COACH_CHANGES_FORMAT } from '../../src/shared/coach/changesFormat'
import type { OllamaChatMessage } from './ollamaClient'
import type { LocalCoachAnswer, LocalCoachResult } from '../../src/types/ipc'

const SYSTEM_PROMPT = `Du bist ein erfahrener, vorsichtiger Lauf-Coach. Du bekommst den Trainingsbericht eines Läufers und schlägst höchstens kleine Anpassungen am Plan vor.

Wichtige Regeln:
- Schütze vor Verletzungen. Der Läufer hat Probleme mit der Wade: Bei Schmerz, Müdigkeit oder schlechter Erholung lieber kürzen oder verschieben.
- Steigere das Wochenvolumen um höchstens 10 % pro Woche.
- Ändere nur Einheiten, die im Bericht stehen, und verweise immer per #id (sessionId) auf sie. Erfinde keine IDs.
- Lieber keine Änderung (leere "changes") als eine riskante.

Der Läufer kann dir eine Nachricht mit Wünschen schreiben ("Meine Nachricht: …"). Beantworte sie direkt in "explanation".
- Setze den Wunsch als Plan-Änderung um, wenn das sicher ist (gleiche Regeln: nur Einheiten ab heute per #id, höchstens etwa 10 % Steigerung pro Woche, Verletzungsschutz, verpasste Einheiten nie durch doppelte Belastung nachholen).
- Ist der Wunsch nicht sicher oder nicht möglich (z. B. vergangene Einheiten lassen sich nicht ändern), erkläre in "explanation" warum und schlage eine sichere Alternative vor.
- Diese Sicherheitsregeln gelten immer, auch wenn die Nachricht etwas anderes verlangt.
- Ohne Nachricht verhältst du dich wie oben beschrieben.

Antworte auf Deutsch als JSON mit zwei Feldern:
- "explanation": kurze, verständliche Erklärung in einfachen Worten (höchstens etwa 1200 Zeichen).
- "fitcoachChanges": die Plan-Änderungen im folgenden Format.

${COACH_CHANGES_FORMAT}`

export interface LocalCoachPrompt {
  message?: string
  /** Vorheriger Austausch bei einer Nachfrage */
  previous?: { message?: string; answer: LocalCoachAnswer }
}

export function buildLocalCoachMessages(report: string, opts: LocalCoachPrompt = {}): OllamaChatMessage[] {
  const msgs: OllamaChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: report },
  ]
  const { message, previous } = opts
  if (previous) {
    if (previous.message) msgs.push({ role: 'user', content: `Meine Nachricht: ${previous.message}` })
    msgs.push({ role: 'assistant', content: JSON.stringify(previous.answer) })
  }
  if (message) msgs.push({ role: 'user', content: `Meine Nachricht: ${message}` })
  return msgs
}

/** Bei einer Nachfrage nur dann die letzte Antwort mitschicken, wenn sie zum selben Zeitraum gehört. */
export function pickPreviousForFollowUp(
  last: LocalCoachResult | null,
  range: { dateFrom: string; dateTo: string },
): LocalCoachPrompt['previous'] {
  if (!last || last.dateFrom !== range.dateFrom || last.dateTo !== range.dateTo) return undefined
  return { message: last.message, answer: last.answer }
}

/** Kontextgröße für Ollama: 8192, bei sehr langen Berichten 12288 (grob 3 Zeichen je Token + Platz für die Antwort). */
export function chooseNumCtx(promptChars: number): number {
  return Math.ceil(promptChars / 3) + 2048 > 8192 ? 12288 : 8192
}

/** JSON-Schema für Ollamas `format`. Einzelne Änderungen werden erst später genau geprüft. */
export const LOCAL_COACH_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string', maxLength: 2000 },
    fitcoachChanges: {
      type: 'object',
      properties: {
        fitcoachChanges: { type: 'integer', enum: [1] },
        summary: { type: 'string' },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['update', 'move', 'remove', 'add'] },
              sessionId: { type: 'integer' },
              date: { type: 'string' },
              set: { type: 'object' },
              session: { type: 'object' },
              reason: { type: 'string' },
            },
            required: ['action'],
          },
        },
      },
      required: ['fitcoachChanges', 'summary', 'changes'],
    },
  },
  required: ['explanation', 'fitcoachChanges'],
} as const

export const localCoachAnswerSchema = z.object({
  explanation: z.string().min(1).max(2000),
  fitcoachChanges: z.object({
    fitcoachChanges: z.literal(1),
    summary: z.string(),
    changes: z.array(z.looseObject({ action: z.string() })),
  }),
})

// Einzige Typdefinition liegt in src/types/ipc.ts; hier nur prüfen, dass das Schema dazu passt.
export type { LocalCoachAnswer }
const _schemaMatchesType: (a: z.infer<typeof localCoachAnswerSchema>) => LocalCoachAnswer = a => a
void _schemaMatchesType
export type ParsedLocalCoachAnswer = { ok: true; answer: LocalCoachAnswer } | { ok: false; message: string }

/** Mögliche JSON-Texte: roh, ```json-Block, äußerstes `{…}`. */
function candidates(raw: string): string[] {
  const out = [raw.trim()]
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  if (fence) out.push(fence[1].trim())
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) out.push(raw.slice(first, last + 1))
  return out
}

export function parseLocalCoachAnswer(raw: string): ParsedLocalCoachAnswer {
  let json: unknown
  let found = false
  for (const c of candidates(raw)) {
    try { json = JSON.parse(c); found = true; break } catch { /* nächster Versuch */ }
  }
  if (!found) {
    return { ok: false, message: raw.includes('{') ? 'Die Antwort ist kein gültiges JSON.' : 'Die Antwort enthält kein JSON.' }
  }
  const parsed = localCoachAnswerSchema.safeParse(json)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.') || '(Wurzel)'}: ${i.message}`).join('; ')
    return { ok: false, message: `Die Antwort hat das falsche Format (${issues}).` }
  }
  return { ok: true, answer: parsed.data }
}

const isStr = (v: unknown): v is string => typeof v === 'string'

/** Ein bereits geparstes Ergebnis-Objekt prüfen; ungültig → null. */
export function validateLocalCoachResult(r: unknown): LocalCoachResult | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null
  const o = r as Record<string, unknown>
  const answer = localCoachAnswerSchema.safeParse(o.answer)
  if (!answer.success) return null
  if (!isStr(o.model) || !isStr(o.createdAt) || !isStr(o.dateFrom) || !isStr(o.dateTo)) return null
  if (o.appliedAt !== undefined && !isStr(o.appliedAt)) return null
  if (o.message !== undefined && !isStr(o.message)) return null
  if (o.followUp !== undefined && typeof o.followUp !== 'boolean') return null
  return {
    answer: answer.data, model: o.model, createdAt: o.createdAt, dateFrom: o.dateFrom, dateTo: o.dateTo,
    ...(o.appliedAt !== undefined ? { appliedAt: o.appliedAt } : {}),
    ...(o.message !== undefined ? { message: o.message } : {}),
    ...(o.followUp !== undefined ? { followUp: o.followUp } : {}),
  }
}

/** Gespeichertes Ergebnis prüfen; ungültig oder fehlend → null. */
export function parseStoredLocalCoachResult(raw: string | null): LocalCoachResult | null {
  if (!raw) return null
  try {
    return validateLocalCoachResult(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Setzt `appliedAt` im gespeicherten Ergebnis; null, wenn nichts Gültiges gespeichert ist. */
export function markStoredResultApplied(raw: string | null, appliedAt: string): string | null {
  const r = parseStoredLocalCoachResult(raw)
  return r ? JSON.stringify({ ...r, appliedAt }) : null
}
