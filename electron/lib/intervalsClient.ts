/**
 * Schlanker Client für die intervals.icu-API. Ohne `electron`-Import, `fetch` injizierbar.
 * Der API-Schlüssel erscheint nie in Fehlermeldungen.
 */
import { gunzipSync } from 'node:zlib'
import { z } from 'zod'

export type IntervalsErrorKind = 'auth' | 'rate' | 'network' | 'http' | 'format'

export class IntervalsError extends Error {
  constructor(public readonly kind: IntervalsErrorKind, message: string, public readonly status?: number) {
    super(message)
    this.name = 'IntervalsError'
  }
  /** Fehler, bei denen ein weiterer Versuch im selben Sync sinnlos ist. */
  get fatal(): boolean { return this.kind === 'auth' || this.kind === 'rate' }
}

const num = z.number().nullish()
const text = z.string().nullish()

export const icuAthleteSchema = z.looseObject({ id: z.union([z.string(), z.number()]).nullish(), name: text })
export const icuActivitySchema = z.looseObject({
  id: z.union([z.string(), z.number()]),
  start_date_local: text,
  type: text,
  name: text,
  distance: num,
  moving_time: num,
  elapsed_time: num,
  total_elevation_gain: num,
  average_heartrate: num,
  max_heartrate: num,
  average_cadence: num,
  source: text,
})
export const icuWellnessSchema = z.looseObject({
  id: z.union([z.string(), z.number()]),
  restingHR: num,
  hrv: num,
  sleepSecs: num,
  sleepScore: num,
  readiness: num,
})

export type IcuAthlete = z.infer<typeof icuAthleteSchema>
export type IcuActivity = z.infer<typeof icuActivitySchema>
export type IcuWellness = z.infer<typeof icuWellnessSchema>

export interface IntervalsClient {
  getAthlete(): Promise<IcuAthlete>
  listActivities(oldest: string, newest: string): Promise<IcuActivity[]>
  downloadOriginal(id: string): Promise<Buffer | null>
  listWellness(oldest: string, newest: string): Promise<IcuWellness[]>
}

export interface IntervalsClientOptions {
  apiKey: string
  fetch?: typeof fetch
  baseUrl?: string
}

const TIMEOUT_MS = 20_000

export function createIntervalsClient(opts: IntervalsClientOptions): IntervalsClient {
  const doFetch = opts.fetch ?? globalThis.fetch
  const baseUrl = (opts.baseUrl ?? 'https://intervals.icu/api/v1').replace(/\/+$/, '')
  const authorization = 'Basic ' + Buffer.from(`API_KEY:${opts.apiKey}`).toString('base64')

  async function request(path: string): Promise<Response> {
    try {
      return await doFetch(`${baseUrl}${path}`, {
        headers: { Authorization: authorization, 'User-Agent': 'FitCoach-Desktop/1.0', Accept: '*/*' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new IntervalsError('network', 'Keine Verbindung zu intervals.icu')
    }
  }

  /** Gemeinsame Statusbehandlung; gibt die Antwort nur bei 2xx zurück. */
  function check(res: Response, opts2: { forbiddenIsAuth: boolean }): void {
    if (res.ok) return
    if (res.status === 429) {
      throw new IntervalsError('rate', 'Zu viele Anfragen an intervals.icu – bitte später erneut versuchen', 429)
    }
    if (res.status === 401 || (res.status === 403 && opts2.forbiddenIsAuth)) {
      throw new IntervalsError('auth', 'API-Schlüssel ungültig', res.status)
    }
    throw new IntervalsError('http', `intervals.icu hat mit Fehler ${res.status} geantwortet`, res.status)
  }

  async function getJson<S extends z.ZodType>(path: string, schema: S, forbiddenIsAuth = false): Promise<z.infer<S>> {
    const res = await request(path)
    check(res, { forbiddenIsAuth })
    let body: unknown
    try {
      body = await res.json()
    } catch {
      throw new IntervalsError('format', 'Unerwartete Antwort von intervals.icu')
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new IntervalsError('format', 'Unerwartete Antwort von intervals.icu')
    return parsed.data
  }

  const range = (oldest: string, newest: string) =>
    `oldest=${encodeURIComponent(oldest)}&newest=${encodeURIComponent(newest)}`

  return {
    getAthlete: () => getJson('/athlete/0', icuAthleteSchema, true),
    listActivities: (oldest, newest) =>
      getJson(`/athlete/0/activities?${range(oldest, newest)}`, z.array(icuActivitySchema)),
    listWellness: (oldest, newest) =>
      getJson(`/athlete/0/wellness?${range(oldest, newest)}`, z.array(icuWellnessSchema)),
    async downloadOriginal(id) {
      const res = await request(`/activity/${encodeURIComponent(id)}/file`)
      if (res.status === 403 || res.status === 404) return null
      check(res, { forbiddenIsAuth: false })
      let buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0) return null
      if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        try { buf = gunzipSync(buf) } catch { return null }
      }
      return buf.length === 0 ? null : buf
    },
  }
}
