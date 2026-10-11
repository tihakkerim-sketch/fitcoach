import { describe, it, expect, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import { createIntervalsClient, IntervalsError } from './intervalsClient'

const KEY = 'secret-key-123456'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function client(fn: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => fn(String(url), init ?? {}))
  return { f, c: createIntervalsClient({ apiKey: KEY, fetch: f as unknown as typeof fetch, baseUrl: 'https://x.test/api/v1' }) }
}

describe('intervalsClient', () => {
  it('sends Basic auth, user agent and a timeout signal', async () => {
    const { f, c } = client(() => json({ id: 'i1', name: 'Adel' }))
    expect((await c.getAthlete()).name).toBe('Adel')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://x.test/api/v1/athlete/0')
    const h = init.headers as Record<string, string>
    expect(h.Authorization).toBe('Basic ' + Buffer.from(`API_KEY:${KEY}`).toString('base64'))
    expect(h['User-Agent']).toBe('FitCoach-Desktop/1.0')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('lists activities and wellness with date range, keeps unknown fields', async () => {
    const { f, c } = client(url => url.includes('/wellness') ? json([{ id: '2026-10-10', hrv: 60, extra: 1 }]) : json([{ id: 'i1', type: 'Run', extra: 2 }]))
    const acts = await c.listActivities('2026-09-10', '2026-10-10')
    expect(acts[0]).toMatchObject({ id: 'i1', type: 'Run', extra: 2 })
    expect(String(f.mock.calls[0][0])).toContain('/athlete/0/activities?oldest=2026-09-10&newest=2026-10-10')
    expect((await c.listWellness('2026-10-10', '2026-10-10'))[0].hrv).toBe(60)
  })

  it('maps 401/403 on profile to "API-Schlüssel ungültig"', async () => {
    for (const status of [401, 403]) {
      const { c } = client(() => new Response('no', { status }))
      await expect(c.getAthlete()).rejects.toMatchObject({ kind: 'auth', message: expect.stringContaining('API-Schlüssel ungültig') })
    }
  })

  it('429 gives a fatal rate error whose message does not contain the key', async () => {
    const { c } = client(() => new Response('', { status: 429, headers: { 'Retry-After': '60' } }))
    const err = await c.listActivities('a', 'b').catch(e => e)
    expect(err).toBeInstanceOf(IntervalsError)
    expect(err.kind).toBe('rate')
    expect(err.fatal).toBe(true)
    expect(err.message).toContain('Zu viele Anfragen')
    expect(err.message).not.toContain(KEY)
  })

  it('network failure gives a German message', async () => {
    const { c } = client(() => { throw new TypeError('fetch failed') })
    await expect(c.getAthlete()).rejects.toMatchObject({ kind: 'network', message: 'Keine Verbindung zu intervals.icu' })
  })

  it('invalid response shape gives a format error', async () => {
    const { c } = client(() => json({ not: 'an array' }))
    await expect(c.listActivities('a', 'b')).rejects.toMatchObject({ kind: 'format' })
  })

  it('downloadOriginal: gunzips, 403/404/empty give null, 401/429 throw', async () => {
    const raw = Buffer.from('<?xml version="1.0"?><x/>')
    expect((await client(() => new Response(gzipSync(raw))).c.downloadOriginal('i1'))!.equals(raw)).toBe(true)
    expect((await client(() => new Response(raw)).c.downloadOriginal('i1'))!.equals(raw)).toBe(true)
    expect(await client(() => new Response('', { status: 403 })).c.downloadOriginal('i1')).toBeNull()
    expect(await client(() => new Response('', { status: 404 })).c.downloadOriginal('i1')).toBeNull()
    expect(await client(() => new Response(new Uint8Array(0))).c.downloadOriginal('i1')).toBeNull()
    await expect(client(() => new Response('', { status: 401 })).c.downloadOriginal('i1')).rejects.toMatchObject({ kind: 'auth' })
    await expect(client(() => new Response('', { status: 429 })).c.downloadOriginal('i1')).rejects.toMatchObject({ kind: 'rate' })
  })
})
