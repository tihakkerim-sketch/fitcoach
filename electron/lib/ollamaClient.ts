/**
 * Schlanker Client für einen lokalen Ollama-Server. Ohne `electron`-Import, `fetch` injizierbar.
 */
export type OllamaErrorKind = 'unreachable' | 'model_missing' | 'http' | 'format' | 'timeout' | 'cancelled'

export class OllamaError extends Error {
  constructor(public readonly kind: OllamaErrorKind, message: string, public readonly status?: number) {
    super(message)
    this.name = 'OllamaError'
  }
}

export interface OllamaChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface OllamaModel { name: string; size: number }

export interface ChatStreamOptions {
  model: string
  messages: OllamaChatMessage[]
  /** JSON-Schema für Ollamas `format` */
  format: unknown
  numCtx: number
  signal?: AbortSignal
  /** Wird bei jedem Stück mit der bisherigen Gesamtlänge (Zeichen) aufgerufen */
  onChunk?: (totalChars: number) => void
  /** Höchstens so lange ohne neues Stück (Standard 2 min) */
  idleTimeoutMs?: number
  /** Höchstdauer insgesamt (Standard 15 min) */
  totalTimeoutMs?: number
}

export interface OllamaClient {
  listModels(): Promise<OllamaModel[]>
  /** Liefert den vollständigen Antworttext. */
  chatStream(opts: ChatStreamOptions): Promise<string>
}

export interface OllamaClientOptions {
  baseUrl: string
  fetch?: typeof fetch
}

const IDLE_TIMEOUT_MS = 2 * 60_000
const TOTAL_TIMEOUT_MS = 15 * 60_000
const TAGS_TIMEOUT_MS = 10_000

/** Nur http/https mit Host (+ Port), ohne Pfad, Query, Anker oder Zugangsdaten. */
export function normalizeOllamaUrl(input: string): string {
  let u: URL
  try { u = new URL(input.trim()) } catch { throw new Error('Ungültige Adresse') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Nur http:// oder https:// erlaubt')
  if (!u.hostname) throw new Error('Adresse ohne Host')
  if (u.username || u.password) throw new Error('Keine Zugangsdaten in der Adresse')
  if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) {
    throw new Error('Adresse darf keinen Pfad oder Parameter enthalten')
  }
  return `${u.protocol}//${u.host}`
}

export function createOllamaClient(opts: OllamaClientOptions): OllamaClient {
  const doFetch = opts.fetch ?? globalThis.fetch
  const baseUrl = normalizeOllamaUrl(opts.baseUrl)
  const unreachable = () =>
    new OllamaError('unreachable', `Lokaler Coach nicht erreichbar unter ${baseUrl}. Läuft Ollama auf dem PC?`)

  /** Fehlerantwort (nicht 2xx) in einen OllamaError übersetzen. */
  async function httpError(res: Response, model?: string): Promise<OllamaError> {
    let detail = ''
    try {
      const body = await res.text()
      try { detail = String((JSON.parse(body) as { error?: unknown }).error ?? '') } catch { detail = body }
    } catch { /* Text nicht lesbar */ }
    if (res.status === 404 && model && /not found/i.test(detail)) {
      return new OllamaError('model_missing', `Modell ${model} fehlt. Auf dem PC: ollama pull ${model}`, 404)
    }
    return new OllamaError('http', `Lokaler Coach hat mit Fehler ${res.status} geantwortet${detail ? `: ${detail.slice(0, 200)}` : ''}`, res.status)
  }

  return {
    async listModels() {
      let res: Response
      try {
        res = await doFetch(`${baseUrl}/api/tags`, { redirect: 'error', signal: AbortSignal.timeout(TAGS_TIMEOUT_MS) })
      } catch {
        throw unreachable()
      }
      if (!res.ok) throw await httpError(res)
      let body: unknown
      try { body = await res.json() } catch { throw new OllamaError('format', 'Unerwartete Antwort vom lokalen Coach') }
      const models = (body as { models?: unknown } | null)?.models
      if (!Array.isArray(models)) throw new OllamaError('format', 'Unerwartete Antwort vom lokalen Coach')
      return models
        .filter((m): m is { name: string; size?: unknown } => typeof (m as { name?: unknown } | null)?.name === 'string')
        .map(m => ({ name: m.name, size: typeof m.size === 'number' ? m.size : 0 }))
    },

    async chatStream(o) {
      const idleMs = o.idleTimeoutMs ?? IDLE_TIMEOUT_MS
      const totalMs = o.totalTimeoutMs ?? TOTAL_TIMEOUT_MS
      const ctrl = new AbortController()
      let reason: 'timeout' | 'cancelled' | null = null
      const stop = (r: 'timeout' | 'cancelled') => { reason ??= r; ctrl.abort() }

      let idleTimer: ReturnType<typeof setTimeout> | undefined
      const armIdle = () => {
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => stop('timeout'), idleMs)
      }
      const totalTimer = setTimeout(() => stop('timeout'), totalMs)
      const onAbort = () => stop('cancelled')
      if (o.signal?.aborted) onAbort()
      else o.signal?.addEventListener('abort', onAbort, { once: true })
      armIdle()

      const aborted = () => reason === 'timeout'
        ? new OllamaError('timeout', 'Der lokale Coach antwortet nicht mehr (Zeitüberschreitung)')
        : new OllamaError('cancelled', 'Abgebrochen')

      try {
        if (reason) throw aborted()
        let res: Response
        try {
          res = await doFetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: o.model,
              messages: o.messages,
              stream: true,
              think: false,
              format: o.format,
              options: { num_ctx: o.numCtx },
              keep_alive: '10m',
            }),
            redirect: 'error',
            signal: ctrl.signal,
          })
        } catch {
          throw reason ? aborted() : unreachable()
        }
        if (!res.ok) throw await httpError(res, o.model)
        if (!res.body) throw new OllamaError('format', 'Leere Antwort vom lokalen Coach')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let content = ''
        let done = false

        const handleLine = (line: string) => {
          if (!line.trim()) return
          let msg: { message?: { content?: unknown }; done?: boolean; error?: unknown }
          try { msg = JSON.parse(line) } catch { throw new OllamaError('format', 'Unerwartete Antwort vom lokalen Coach') }
          if (typeof msg.error === 'string') throw new OllamaError('http', `Lokaler Coach: ${msg.error}`)
          if (typeof msg.message?.content === 'string' && msg.message.content) {
            content += msg.message.content
            o.onChunk?.(content.length)
          }
          if (msg.done === true) done = true
        }

        try {
          while (!done) {
            const { value, done: eof } = await reader.read()
            if (eof) break
            armIdle()
            buffer += decoder.decode(value, { stream: true })
            let nl: number
            while (!done && (nl = buffer.indexOf('\n')) >= 0) {
              handleLine(buffer.slice(0, nl))
              buffer = buffer.slice(nl + 1)
            }
          }
          if (!done) {
            buffer += decoder.decode()
            handleLine(buffer)
          }
        } catch (e) {
          if (e instanceof OllamaError) throw e
          throw reason ? aborted() : unreachable()
        } finally {
          reader.cancel().catch(() => {})
        }
        if (reason) throw aborted()
        if (!done) throw new OllamaError('format', 'Antwort des lokalen Coachs war unvollständig')
        return content
      } finally {
        clearTimeout(idleTimer)
        clearTimeout(totalTimer)
        o.signal?.removeEventListener('abort', onAbort)
      }
    },
  }
}
