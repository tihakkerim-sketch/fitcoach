/**
 * Prompt und Antwort-Prüfung für den lokalen Coach (Ollama). Ohne `electron`-Import.
 */
import { z } from 'zod'
import { COACH_CHANGES_FORMAT } from '../../src/shared/coach/changesFormat'
import type { OllamaChatMessage } from './ollamaClient'
import type { LocalCoachAnswer } from '../../src/types/ipc'

const SYSTEM_PROMPT = `Du bist ein erfahrener, vorsichtiger Lauf-Coach. Du bekommst den Trainingsbericht eines Läufers und schlägst höchstens kleine Anpassungen am Plan vor.

Wichtige Regeln:
- Schütze vor Verletzungen. Der Läufer hat Probleme mit der Wade: Bei Schmerz, Müdigkeit oder schlechter Erholung lieber kürzen oder verschieben.
- Steigere das Wochenvolumen um höchstens 10 % pro Woche.
- Ändere nur Einheiten, die im Bericht stehen, und verweise immer per #id (sessionId) auf sie. Erfinde keine IDs.
- Lieber keine Änderung (leere "changes") als eine riskante.

Antworte auf Deutsch als JSON mit zwei Feldern:
- "explanation": kurze, verständliche Erklärung in einfachen Worten (höchstens etwa 1200 Zeichen).
- "fitcoachChanges": die Plan-Änderungen im folgenden Format.

${COACH_CHANGES_FORMAT}`

export function buildLocalCoachMessages(report: string): OllamaChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: report },
  ]
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
