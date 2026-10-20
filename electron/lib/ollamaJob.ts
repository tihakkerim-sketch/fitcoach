/**
 * Hintergrund-Job für den lokalen Coach (Ollama): Zustandsautomat ohne `electron`-Import.
 * `start()` wirft sofort, wenn schon ein Lauf aktiv ist; das zurückgegebene Promise
 * endet immer ohne Fehler – alle Fehler stehen in `status()`.
 */
import type { LocalCoachResult, LocalCoachStatus } from '../../src/types/ipc'
import { OllamaError, type OllamaChatMessage, type OllamaClient } from './ollamaClient'
import { buildLocalCoachMessages, chooseNumCtx, LOCAL_COACH_SCHEMA, parseLocalCoachAnswer } from './ollamaPrompt'

export interface OllamaJobDeps {
  client: OllamaClient
  model: string
  range: { dateFrom: string; dateTo: string }
  buildReport: () => string
  saveResult: (r: LocalCoachResult) => void
  now?: () => number
  idleTimeoutMs?: number
  totalTimeoutMs?: number
}

export interface OllamaJob {
  start(deps: OllamaJobDeps): Promise<void>
  cancel(): void
  status(): LocalCoachStatus
}

export function createOllamaJob(): OllamaJob {
  let status: LocalCoachStatus = { state: 'idle' }
  let controller: AbortController | null = null

  const running = () => status.state === 'connecting' || status.state === 'generating'

  async function run(deps: OllamaJobDeps, ctrl: AbortController, startedAt: number): Promise<void> {
    const now = deps.now ?? Date.now
    const stream = (messages: OllamaChatMessage[], numCtx: number) =>
      deps.client.chatStream({
        model: deps.model,
        messages,
        format: LOCAL_COACH_SCHEMA,
        numCtx,
        signal: ctrl.signal,
        onChunk: chars => { if (!ctrl.signal.aborted) status = { state: 'generating', startedAt, chars } },
        idleTimeoutMs: deps.idleTimeoutMs,
        totalTimeoutMs: deps.totalTimeoutMs,
      })

    try {
      const report = deps.buildReport()
      const messages = buildLocalCoachMessages(report)
      const numCtx = chooseNumCtx(messages.reduce((n, m) => n + m.content.length, 0))

      let raw = await stream(messages, numCtx)
      if (ctrl.signal.aborted) { status = { state: 'cancelled' }; return }
      let parsed = parseLocalCoachAnswer(raw)
      if (!parsed.ok) {
        const retry: OllamaChatMessage[] = [
          ...messages,
          { role: 'assistant', content: raw.slice(0, 4000) },
          { role: 'user', content: `Deine Antwort war kein gültiges JSON: ${parsed.message}. Antworte nur mit dem JSON-Objekt im verlangten Format.` },
        ]
        raw = await stream(retry, chooseNumCtx(retry.reduce((n, m) => n + m.content.length, 0)))
        if (ctrl.signal.aborted) { status = { state: 'cancelled' }; return }
        parsed = parseLocalCoachAnswer(raw)
        if (!parsed.ok) {
          status = { state: 'error', message: `Der lokale Coach hat zweimal keine gültige Antwort geliefert: ${parsed.message}`, raw }
          return
        }
      }

      deps.saveResult({
        answer: parsed.answer,
        model: deps.model,
        createdAt: new Date(now()).toISOString(),
        ...deps.range,
      })
      status = { state: 'done', startedAt, finishedAt: now() }
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof OllamaError && e.kind === 'cancelled')) {
        status = { state: 'cancelled' }
      } else if (e instanceof OllamaError) {
        status = { state: 'error', message: e.message }
      } else {
        status = { state: 'error', message: `Unerwarteter Fehler beim lokalen Coach: ${e instanceof Error ? e.message : String(e)}` }
      }
    } finally {
      controller = null
    }
  }

  return {
    start(deps) {
      if (running()) throw new Error('Der lokale Coach läuft schon.')
      const ctrl = new AbortController()
      controller = ctrl
      const startedAt = (deps.now ?? Date.now)()
      status = { state: 'connecting', startedAt }
      return run(deps, ctrl, startedAt)
    },
    cancel() {
      if (running()) controller?.abort()
    },
    status: () => status,
  }
}
