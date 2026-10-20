import { describe, it, expect, vi } from 'vitest'
import { createOllamaJob, type OllamaJobDeps } from './ollamaJob'
import { OllamaError, type ChatStreamOptions, type OllamaClient } from './ollamaClient'
import type { LocalCoachResult, LocalCoachStatus } from '../../src/types/ipc'

const goodAnswer = {
  explanation: 'Alles ruhig.',
  fitcoachChanges: { fitcoachChanges: 1, summary: 'Keine Änderung', changes: [] },
}
const goodRaw = JSON.stringify(goodAnswer)

function setup(impl: (o: ChatStreamOptions, call: number) => Promise<string>, extra: Partial<OllamaJobDeps> = {}) {
  const calls: ChatStreamOptions[] = []
  const client: OllamaClient = {
    listModels: async () => [],
    chatStream: o => {
      calls.push({ ...o, messages: [...o.messages] })
      return impl(o, calls.length)
    },
  }
  const saved: LocalCoachResult[] = []
  const deps: OllamaJobDeps = {
    client,
    model: 'qwen3:8b',
    range: { dateFrom: '2026-10-01', dateTo: '2026-10-20' },
    buildReport: () => 'BERICHT',
    saveResult: r => { saved.push(r) },
    now: () => Date.UTC(2026, 9, 20, 10, 0, 0),
    ...extra,
  }
  return { deps, calls, saved }
}

describe('createOllamaJob', () => {
  it('starts idle', () => {
    expect(createOllamaJob().status()).toEqual({ state: 'idle' })
  })

  it('runs connecting -> generating -> done and saves the result', async () => {
    const job = createOllamaJob()
    const seen: LocalCoachStatus['state'][] = []
    const { deps, calls, saved } = setup(async o => {
      await Promise.resolve()
      seen.push(job.status().state)
      o.onChunk?.(10)
      seen.push(job.status().state)
      expect(job.status()).toMatchObject({ state: 'generating', chars: 10 })
      return goodRaw
    })
    const p = job.start(deps)
    expect(job.status()).toMatchObject({ state: 'connecting' })
    await p
    expect(seen).toEqual(['connecting', 'generating'])
    expect(job.status()).toMatchObject({ state: 'done' })
    expect(saved).toEqual([{
      answer: goodAnswer, model: 'qwen3:8b', createdAt: '2026-10-20T10:00:00.000Z',
      dateFrom: '2026-10-01', dateTo: '2026-10-20',
    }])
    expect(calls).toHaveLength(1)
    expect(calls[0].model).toBe('qwen3:8b')
    expect(calls[0].numCtx).toBe(8192)
    expect(calls[0].messages[1]).toEqual({ role: 'user', content: 'BERICHT' })
  })

  it('retries once with the broken answer and a hint, then succeeds', async () => {
    const job = createOllamaJob()
    const { deps, calls, saved } = setup(async (_o, n) => (n === 1 ? 'kein json' : goodRaw))
    await job.start(deps)
    expect(calls).toHaveLength(2)
    expect(calls[1].messages).toHaveLength(4)
    expect(calls[1].messages[2]).toEqual({ role: 'assistant', content: 'kein json' })
    expect(calls[1].messages[3].role).toBe('user')
    expect(calls[1].messages[3].content).toContain('Deine Antwort war kein gültiges JSON: Die Antwort enthält kein JSON.')
    expect(calls[1].messages[3].content).toContain('Antworte nur mit dem JSON-Objekt im verlangten Format.')
    expect(job.status()).toMatchObject({ state: 'done' })
    expect(saved).toHaveLength(1)
  })

  it('errors with the raw text after two broken answers', async () => {
    const job = createOllamaJob()
    const { deps, calls, saved } = setup(async (_o, n) => (n === 1 ? 'eins' : 'zwei {'))
    await job.start(deps)
    expect(calls).toHaveLength(2)
    expect(saved).toHaveLength(0)
    const st = job.status()
    expect(st).toMatchObject({ state: 'error', raw: 'zwei {' })
    expect((st as { message: string }).message).toContain('Der lokale Coach hat zweimal keine gültige Antwort geliefert: ')
  })

  it('rejects a second start while running, then allows a new one after it ended', async () => {
    const job = createOllamaJob()
    let release!: (s: string) => void
    const { deps } = setup(() => new Promise<string>(r => { release = r }))
    const p = job.start(deps)
    expect(() => job.start(deps)).toThrow('Der lokale Coach läuft schon.')
    release(goodRaw)
    await p
    expect(job.status().state).toBe('done')
    const second = setup(async () => goodRaw)
    await job.start(second.deps)
    expect(job.status().state).toBe('done')
    expect(second.saved).toHaveLength(1)
  })

  it('cancels mid-stream without saving', async () => {
    const job = createOllamaJob()
    const { deps, saved } = setup(o => new Promise<string>((_res, rej) => {
      o.onChunk?.(5)
      o.signal!.addEventListener('abort', () => rej(new OllamaError('cancelled', 'Abgebrochen')))
    }))
    const p = job.start(deps)
    job.cancel()
    await p
    expect(job.status()).toEqual({ state: 'cancelled' })
    expect(saved).toHaveLength(0)
  })

  it('cancel is a no-op when idle', () => {
    const job = createOllamaJob()
    job.cancel()
    expect(job.status()).toEqual({ state: 'idle' })
  })

  it('does not retry or save after cancel even if the client returns text', async () => {
    const job = createOllamaJob()
    const { deps, calls, saved } = setup(async () => { job.cancel(); return 'kaputt' })
    await job.start(deps)
    expect(job.status()).toEqual({ state: 'cancelled' })
    expect(calls).toHaveLength(1)
    expect(saved).toHaveLength(0)
  })

  it('reports unreachable as error message', async () => {
    const job = createOllamaJob()
    const { deps } = setup(async () => { throw new OllamaError('unreachable', 'Lokaler Coach nicht erreichbar unter http://x') })
    await job.start(deps)
    expect(job.status()).toEqual({ state: 'error', message: 'Lokaler Coach nicht erreichbar unter http://x' })
  })

  it('reports a throwing buildReport as error', async () => {
    const job = createOllamaJob()
    const { deps, calls } = setup(async () => goodRaw, { buildReport: () => { throw new Error('Keine Daten') } })
    await expect(job.start(deps)).resolves.toBeUndefined()
    expect(calls).toHaveLength(0)
    expect(job.status()).toMatchObject({ state: 'error' })
    expect((job.status() as { message: string }).message).toContain('Keine Daten')
  })

  it('reports a throwing saveResult as error', async () => {
    const job = createOllamaJob()
    const { deps } = setup(async () => goodRaw, { saveResult: vi.fn(() => { throw new Error('Platte voll') }) })
    await job.start(deps)
    expect(job.status()).toMatchObject({ state: 'error' })
    expect((job.status() as { message: string }).message).toContain('Platte voll')
  })

  it('wraps unknown exceptions with a generic German message', async () => {
    const job = createOllamaJob()
    const { deps } = setup(async () => { throw new TypeError('boom') })
    await job.start(deps)
    const st = job.status() as { state: string; message: string }
    expect(st.state).toBe('error')
    expect(st.message).toContain('Unerwarteter Fehler')
    expect(st.message).toContain('boom')
  })

  it('passes timeouts to the client', async () => {
    const job = createOllamaJob()
    const { deps, calls } = setup(async () => goodRaw, { idleTimeoutMs: 5, totalTimeoutMs: 50 })
    await job.start(deps)
    expect(calls[0]).toMatchObject({ idleTimeoutMs: 5, totalTimeoutMs: 50 })
  })
})
