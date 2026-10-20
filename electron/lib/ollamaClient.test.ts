import { describe, it, expect, vi, afterEach } from 'vitest'
import { createOllamaClient, normalizeOllamaUrl, OllamaError } from './ollamaClient'

const enc = new TextEncoder()
const line = (content: string, done = false) => JSON.stringify({ message: { role: 'assistant', content }, done }) + '\n'

/** Antwort mit NDJSON-Stream aus gegebenen Stücken. */
function streamRes(parts: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close() },
  })
  return new Response(stream, { status })
}

/** Stream, der nur Stücke liefert, wenn push() gerufen wird, und bei Abbruch des Signals fehlschlägt. */
function manualStream(signal: AbortSignal) {
  let ctl!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start(c) { ctl = c } })
  signal.addEventListener('abort', () => { try { ctl.error(new DOMException('aborted', 'AbortError')) } catch { /* schon zu */ } })
  return { res: new Response(body), push: (s: string) => ctl.enqueue(enc.encode(s)) }
}

function make(fn: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => fn(String(url), init ?? {}))
  return { f, c: createOllamaClient({ baseUrl: 'http://pc.test:11434', fetch: f as unknown as typeof fetch }) }
}

const base = { model: 'qwen3:8b', messages: [{ role: 'user' as const, content: 'hi' }], format: { type: 'object' }, numCtx: 8192 }

afterEach(() => { vi.useRealTimers() })

describe('normalizeOllamaUrl', () => {
  it('accepts http/https with host and port, strips trailing slash', () => {
    expect(normalizeOllamaUrl('http://192.168.1.5:11434')).toBe('http://192.168.1.5:11434')
    expect(normalizeOllamaUrl(' https://pc.local/ ')).toBe('https://pc.local')
    expect(normalizeOllamaUrl('http://localhost')).toBe('http://localhost')
  })
  it('rejects other schemes, paths, queries, credentials, garbage', () => {
    for (const bad of ['ftp://x', 'file:///c:/x', 'http://x/api', 'http://x?a=1', 'http://x/#h', 'http://u:p@x', 'pc.local', '', 'javascript:alert(1)']) {
      expect(() => normalizeOllamaUrl(bad), bad).toThrow()
    }
  })
})

describe('listModels', () => {
  it('returns name and size', async () => {
    const { f, c } = make(() => new Response(JSON.stringify({ models: [{ name: 'qwen3:8b', size: 5200000000, digest: 'x' }, { name: 'a:1' }] })))
    expect(await c.listModels()).toEqual([{ name: 'qwen3:8b', size: 5200000000 }, { name: 'a:1', size: 0 }])
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://pc.test:11434/api/tags')
    expect(init.redirect).toBe('error')
  })
  it('maps network error to unreachable', async () => {
    const { c } = make(() => { throw new TypeError('fetch failed') })
    await expect(c.listModels()).rejects.toMatchObject({ kind: 'unreachable', message: expect.stringContaining('http://pc.test:11434') })
  })
  it('maps bad body to format and 500 to http', async () => {
    await expect(make(() => new Response('{"x":1}')).c.listModels()).rejects.toMatchObject({ kind: 'format' })
    await expect(make(() => new Response('boom', { status: 500 })).c.listModels()).rejects.toMatchObject({ kind: 'http', status: 500 })
  })
})

describe('chatStream', () => {
  it('sends the expected request body', async () => {
    const { f, c } = make(() => streamRes([line('x', true)]))
    await c.chatStream(base)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://pc.test:11434/api/chat')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('error')
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'qwen3:8b', messages: base.messages, stream: true, think: false,
      format: { type: 'object' }, options: { num_ctx: 8192 }, keep_alive: '10m',
    })
  })

  it('concatenates content and reports growing length', async () => {
    const { c } = make(() => streamRes([line('{"a"'), line(':1}'), line('', true)]))
    const seen: number[] = []
    expect(await c.chatStream({ ...base, onChunk: n => seen.push(n) })).toBe('{"a":1}')
    expect(seen).toEqual([4, 7])
  })

  it('handles lines split across chunk boundaries (also multi-byte chars)', async () => {
    const all = line('Grüße ') + line('Welt', true)
    const bytes = enc.encode(all)
    const cut = enc.encode(all.slice(0, all.indexOf('ü'))).length + 1 // mitten im 2-Byte-Zeichen "ü"
    const stream = new ReadableStream<Uint8Array>({
      start(ctl) { ctl.enqueue(bytes.slice(0, cut)); ctl.enqueue(bytes.slice(cut, cut + 7)); ctl.enqueue(bytes.slice(cut + 7)); ctl.close() },
    })
    const { c } = make(() => new Response(stream))
    expect(await c.chatStream(base)).toBe('Grüße Welt')
  })

  it('accepts several lines in one chunk and a final line without newline', async () => {
    const { c } = make(() => streamRes([line('a') + line('b'), JSON.stringify({ message: { content: 'c' }, done: true })]))
    expect(await c.chatStream(base)).toBe('abc')
  })

  it('maps 404 "model not found" to model_missing', async () => {
    const { c } = make(() => new Response(JSON.stringify({ error: "model 'qwen3:8b' not found" }), { status: 404 }))
    const err = await c.chatStream(base).catch(e => e)
    expect(err).toBeInstanceOf(OllamaError)
    expect(err).toMatchObject({ kind: 'model_missing', message: 'Modell qwen3:8b fehlt. Auf dem PC: ollama pull qwen3:8b' })
  })

  it('maps other HTTP errors to http', async () => {
    const { c } = make(() => new Response('kaputt', { status: 500 }))
    await expect(c.chatStream(base)).rejects.toMatchObject({ kind: 'http', status: 500 })
  })

  it('maps an error line in the stream to http', async () => {
    const { c } = make(() => streamRes([line('a'), JSON.stringify({ error: 'out of memory' }) + '\n']))
    await expect(c.chatStream(base)).rejects.toMatchObject({ kind: 'http', message: expect.stringContaining('out of memory') })
  })

  it('maps garbage lines and truncated streams to format', async () => {
    await expect(make(() => streamRes(['kein json\n'])).c.chatStream(base)).rejects.toMatchObject({ kind: 'format' })
    await expect(make(() => streamRes([line('a')])).c.chatStream(base)).rejects.toMatchObject({ kind: 'format' })
  })

  it('maps network errors to unreachable with url hint', async () => {
    const { c } = make(() => { throw new TypeError('fetch failed') })
    await expect(c.chatStream(base)).rejects.toMatchObject({
      kind: 'unreachable',
      message: 'Lokaler Coach nicht erreichbar unter http://pc.test:11434. Läuft Ollama auf dem PC?',
    })
  })

  it('cancels via external signal, also before start', async () => {
    const m = { s: undefined as ReturnType<typeof manualStream> | undefined }
    const { c } = make((_u, init) => (m.s = manualStream(init.signal as AbortSignal)).res)
    const ac = new AbortController()
    const p = c.chatStream({ ...base, signal: ac.signal }).catch(e => e)
    await vi.waitFor(() => expect(m.s).toBeDefined())
    m.s!.push(line('a'))
    ac.abort()
    expect(await p).toMatchObject({ kind: 'cancelled' })

    const pre = new AbortController(); pre.abort()
    await expect(make(() => streamRes([line('', true)])).c.chatStream({ ...base, signal: pre.signal })).rejects.toMatchObject({ kind: 'cancelled' })
  })

  it('times out when no chunk arrives within the idle time (fake timers)', async () => {
    vi.useFakeTimers()
    const m = { s: undefined as ReturnType<typeof manualStream> | undefined }
    const { c } = make((_u, init) => (m.s = manualStream(init.signal as AbortSignal)).res)
    const p = c.chatStream(base).catch(e => e)
    await vi.advanceTimersByTimeAsync(0)
    m.s!.push(line('a'))
    await vi.advanceTimersByTimeAsync(119_000)
    m.s!.push(line('b')) // setzt den Leerlauf-Timer zurück
    await vi.advanceTimersByTimeAsync(119_000)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await p).toMatchObject({ kind: 'timeout' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out after the total time even if chunks keep coming', async () => {
    vi.useFakeTimers()
    const m = { s: undefined as ReturnType<typeof manualStream> | undefined }
    const { c } = make((_u, init) => (m.s = manualStream(init.signal as AbortSignal)).res)
    const p = c.chatStream({ ...base, idleTimeoutMs: 1000, totalTimeoutMs: 3500 }).catch(e => e)
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 4; i++) { m.s!.push(line('x')); await vi.advanceTimersByTimeAsync(900) }
    expect(await p).toMatchObject({ kind: 'timeout' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears timers after success', async () => {
    vi.useFakeTimers()
    const { c } = make(() => streamRes([line('a', true)]))
    expect(await c.chatStream(base)).toBe('a')
    expect(vi.getTimerCount()).toBe(0)
  })
})
