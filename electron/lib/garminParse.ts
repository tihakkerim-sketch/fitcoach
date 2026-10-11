import type { CreateActivityPayload } from '../../src/types/ipc'
import FitParser from 'fit-file-parser'
import { XMLParser } from 'fast-xml-parser'
import { format } from 'date-fns'
import { elevation, type Sample } from './activityDetails'

export type { Sample } from './activityDetails'

/** Ergebnis eines Datei-Imports: Kopfdaten der Aktivität + Messpunkte (für Splits/Verläufe). */
export interface ParsedActivity {
  activity: Partial<CreateActivityPayload>
  samples: Sample[]
}

// ── Local date/time helper ────────────────────────────────────────────────────

// Date and time come from the same local-time Date, so they can never disagree
// (toISOString() gives the UTC date: a 00:30 run in Vienna landed on the day before).
export function toLocalDateTime(raw: string | Date): { date: string; startTime: string } {
  const d = new Date(raw)
  return { date: format(d, 'yyyy-MM-dd'), startTime: format(d, 'HH:mm') }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const round1 = (v: number) => Math.round(v * 10) / 10

function sportToType(sport: string): CreateActivityPayload['type'] {
  const s = sport.toLowerCase()
  if (s.includes('run')) return 'running'
  if (s.includes('cycl') || s.includes('bik')) return 'cycling'
  return 'custom'
}

// ── FIT parser ────────────────────────────────────────────────────────────────

export interface FitMapOptions {
  /**
   * Einheit von Höhenwerten (altitude, total_ascent/descent) in den Daten.
   * fit-file-parser rechnet bei `lengthUnit: 'km'` ALLE Längen (auch Höhen) in km um → Standard 'km'.
   */
  altitudeUnit?: 'km' | 'm'
}

/**
 * Bildet die Ausgabe von fit-file-parser (lengthUnit 'km') auf Aktivität + Messpunkte ab.
 * Reine Funktion, mit Objekt-Fixture testbar.
 */
export function fitDataToParsed(data: FitData, opts: FitMapOptions = {}): ParsedActivity {
  const toMeters = (opts.altitudeUnit ?? 'km') === 'km' ? 1000 : 1

  // fit-file-parser puts sessions at the top level, not under data.activity
  const sessions: FitSession[] =
    (Array.isArray(data.sessions) && data.sessions.length > 0 ? data.sessions : null) ??
    (Array.isArray((data.activity as { sessions?: FitSession[] } | undefined)?.sessions)
      ? (data.activity as { sessions: FitSession[] }).sessions
      : null) ??
    []
  const session: FitSession = sessions[0] ?? {}

  const records: FitRecord[] =
    (Array.isArray(data.records) && data.records.length > 0 ? data.records : null) ??
    sessions.flatMap(s => (s.laps ?? []).flatMap((l: FitLap) => l.records ?? []))

  const sport = (session.sport ?? (typeof data.sport === 'string' ? data.sport : '') ?? '').toLowerCase()
  const type = sportToType(sport)

  const rawDate = session.start_time ?? records[0]?.timestamp ?? null
  const { date, startTime } = rawDate
    ? toLocalDateTime(rawDate)
    : { date: format(new Date(), 'yyyy-MM-dd'), startTime: undefined }

  let durationMin: number | undefined =
    session.total_elapsed_time != null
      ? Math.round(session.total_elapsed_time / 60)
      : session.total_timer_time != null
      ? Math.round(session.total_timer_time / 60)
      : undefined

  if (!durationMin && records.length >= 2) {
    const first = new Date(records[0].timestamp as string | Date).getTime()
    const last = new Date(records[records.length - 1].timestamp as string | Date).getTime()
    if (!isNaN(first) && !isNaN(last) && last > first) {
      durationMin = Math.round((last - first) / 60000)
    }
  }

  let avgHr: number | undefined = session.avg_heart_rate ?? undefined
  let maxHr: number | undefined = session.max_heart_rate ?? undefined
  if ((!avgHr || !maxHr) && records.length > 0) {
    const hrs = records.map(r => r.heart_rate).filter((h): h is number => isNum(h) && h > 0)
    if (hrs.length > 0) {
      if (!avgHr) avgHr = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)
      if (!maxHr) maxHr = Math.max(...hrs)
    }
  }

  // ── Messpunkte ──
  const samples: Sample[] = []
  let t0: number | null = null
  for (const r of records) {
    const ts = r.timestamp != null ? new Date(r.timestamp).getTime() : NaN
    if (!Number.isFinite(ts)) continue
    if (t0 === null) t0 = ts
    const alt = r.enhanced_altitude ?? r.altitude
    const s: Sample = { tSec: Math.round((ts - t0) / 1000) }
    if (isNum(r.distance)) s.distKm = r.distance
    if (isNum(r.heart_rate) && r.heart_rate > 0) s.hr = r.heart_rate
    if (isNum(alt)) s.altM = alt * toMeters
    if (s.distKm !== undefined || s.hr !== undefined || s.altM !== undefined) samples.push(s)
  }

  // ── Höhenmeter: Session-Summe, sonst aus den Messpunkten ──
  let elevationGainM: number | undefined
  let elevationLossM: number | undefined
  if (isNum(session.total_ascent) || isNum(session.total_descent)) {
    if (isNum(session.total_ascent)) elevationGainM = round1(session.total_ascent * toMeters)
    if (isNum(session.total_descent)) elevationLossM = round1(session.total_descent * toMeters)
  } else if (samples.some(s => s.altM !== undefined)) {
    const el = elevation(samples)
    elevationGainM = round1(el.gainM)
    elevationLossM = round1(el.lossM)
  }

  // Rohdaten nur kompakt: Session-Summen ohne Laps/Records
  const { laps: _laps, records: _records, ...sessionSummary } = session as FitSession & { records?: unknown }
  void _laps; void _records

  return {
    activity: {
      type,
      date,
      startTime,
      source: 'garmin_import',
      durationMin,
      movingTimeMin: isNum(session.total_timer_time) ? round1(session.total_timer_time / 60) : undefined,
      distanceKm: session.total_distance ?? undefined,
      avgHr,
      maxHr,
      avgCadence: session.avg_cadence ?? undefined,
      elevationGainM,
      elevationLossM,
      rawGarminData: {
        format: 'fit',
        session: sessionSummary,
        recordCount: records.length,
        sport,
      } as Record<string, unknown>,
    },
    samples,
  }
}

export function parseFitFile(buffer: Buffer): Promise<ParsedActivity> {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({ force: true, speedUnit: 'km/h', lengthUnit: 'km' })
    parser.parse(buffer, (error: Error | null, data: Record<string, unknown>) => {
      if (error) { reject(error); return }
      try {
        resolve(fitDataToParsed(data as FitData, { altitudeUnit: 'km' }))
      } catch (e) {
        reject(e)
      }
    })
  })
}

// ── TCX parser ────────────────────────────────────────────────────────────────
//
// TCX is Garmin's Training Center XML format.  Structure:
//   TrainingCenterDatabase > Activities > Activity (Sport attr)
//     > Lap[] > TotalTimeSeconds, DistanceMeters, HR fields, Cadence, Track[] > Trackpoint[]
//
// Namespace prefixes (ns3:LX etc.) are stripped by fast-xml-parser's removeNSPrefix.

/** fast-xml-parser liefert bei einem einzelnen Element ein Objekt statt Array. */
function asArray<T>(v: T | T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : v != null ? [v] : []
}

export function parseTcxFile(buffer: Buffer): Promise<ParsedActivity> {
  return new Promise((resolve, reject) => {
    try {
      const xmlStr = buffer.toString('utf-8')

      const parserWithAttrs = new XMLParser({
        ignoreAttributes:    false,   // needed to read @_Sport attribute
        attributeNamePrefix: '@_',
        removeNSPrefix:      true,    // ns3:LX → LX, ns3:AvgRunCadence → AvgRunCadence
        parseAttributeValue: true,
        isArray: (name: string) =>
          name === 'Activity' || name === 'Lap' || name === 'Track' || name === 'Trackpoint',
      })

      const root: TcxRoot = parserWithAttrs.parse(xmlStr)

      // Navigate to Activities
      const db = root?.TrainingCenterDatabase
      if (!db) { reject(new Error('Not a valid TCX file — missing TrainingCenterDatabase root')); return }

      const activitiesEl = db.Activities
      if (!activitiesEl) { reject(new Error('No <Activities> element found in TCX file')); return }

      const activities = asArray(activitiesEl.Activity)
      if (activities.length === 0) { reject(new Error('No <Activity> element found in TCX file')); return }

      const activity = activities[0]

      // ── Sport → type ────────────────────────────────────────────────────────
      const sportRaw = (activity['@_Sport'] ?? '').toString()
      const type = sportToType(sportRaw)

      // ── Date / start time from Activity.Id (ISO timestamp) ─────────────────
      const idStr = activity.Id ? String(activity.Id) : null
      const { date, startTime } = idStr
        ? toLocalDateTime(idStr)
        : { date: format(new Date(), 'yyyy-MM-dd'), startTime: undefined }

      // ── Laps ────────────────────────────────────────────────────────────────
      const laps = asArray(activity.Lap)

      // ── Trackpoints über alle Laps → Messpunkte ─────────────────────────────
      const samples: Sample[] = []
      let t0: number | null = null
      let lastAbsKm = -Infinity
      for (const lap of laps) {
        let offsetKm = 0
        let firstInLap = true
        for (const track of asArray(lap.Track)) {
          for (const tp of asArray(track.Trackpoint)) {
            const ts = tp.Time ? new Date(String(tp.Time)).getTime() : NaN
            if (!Number.isFinite(ts)) continue
            if (t0 === null) t0 = ts
            const s: Sample = { tSec: Math.round((ts - t0) / 1000) }

            if (tp.DistanceMeters != null && Number.isFinite(Number(tp.DistanceMeters))) {
              const rawKm = Number(tp.DistanceMeters) / 1000
              // Manche Dateien zählen die Distanz je Lap neu ab: dann an die vorige Lap anhängen
              if (firstInLap && rawKm < lastAbsKm - 0.001) offsetKm = lastAbsKm
              firstInLap = false
              s.distKm = rawKm + offsetKm
              lastAbsKm = Math.max(lastAbsKm, s.distKm)
            }
            const hr = Number(tp.HeartRateBpm?.Value)
            if (hr > 0) s.hr = hr
            if (tp.AltitudeMeters != null && Number.isFinite(Number(tp.AltitudeMeters))) s.altM = Number(tp.AltitudeMeters)

            if (s.distKm !== undefined || s.hr !== undefined || s.altM !== undefined) samples.push(s)
          }
        }
      }

      // ── Duration: Σ TotalTimeSeconds ────────────────────────────────────────
      let totalSec = 0
      for (const lap of laps) totalSec += Math.max(0, Number(lap.TotalTimeSeconds) || 0)
      const durationMin = totalSec > 0 ? Math.round(totalSec / 60) : undefined

      // ── Distance: Σ DistanceMeters → km ────────────────────────────────────
      let totalMeters = 0
      for (const lap of laps) totalMeters += Math.max(0, Number(lap.DistanceMeters) || 0)
      const distanceKm = totalMeters > 1 ? Math.round(totalMeters) / 1000 : undefined

      // ── Heart rate: weighted average by lap duration, overall max ───────────
      let hrNumerator = 0
      let hrDenominator = 0
      let maxHr = 0

      for (const lap of laps) {
        const dur     = Math.max(0, Number(lap.TotalTimeSeconds) || 0)
        const lapAvg  = Number(lap.AverageHeartRateBpm?.Value) || 0
        const lapMax  = Number(lap.MaximumHeartRateBpm?.Value) || 0
        if (lapAvg > 0 && dur > 0) { hrNumerator += lapAvg * dur; hrDenominator += dur }
        if (lapMax > maxHr) maxHr = lapMax
      }

      let avgHr: number | undefined = hrDenominator > 0
        ? Math.round(hrNumerator / hrDenominator)
        : undefined

      // Fallback: compute HR from individual trackpoints if lap-level HR is absent
      if (!avgHr) {
        const tpHrs = samples.map(s => s.hr).filter((h): h is number => h !== undefined)
        if (tpHrs.length > 0) {
          avgHr = Math.round(tpHrs.reduce((a, b) => a + b, 0) / tpHrs.length)
          if (!maxHr) maxHr = Math.max(...tpHrs)
        }
      }

      // ── Cadence: Lap.Cadence or Extensions.LX.Avg(Run|Bike)Cadence ─────────
      let cadenceSum = 0
      let cadenceCount = 0

      for (const lap of laps) {
        const dur = Number(lap.TotalTimeSeconds) || 0
        if (dur <= 0) continue   // skip zero-duration laps (e.g. rest, transitions)

        if (lap.Cadence != null) {
          cadenceSum += Number(lap.Cadence)
          cadenceCount++
        } else {
          // Extensions.LX is the Garmin activity extension (namespace stripped)
          const lx = lap.Extensions?.LX
          const c  = lx?.AvgRunCadence ?? lx?.AvgBikeCadence
          if (c != null) { cadenceSum += Number(c); cadenceCount++ }
        }
      }

      const avgCadence = cadenceCount > 0 ? Math.round(cadenceSum / cadenceCount) : undefined

      // ── Höhenmeter aus den Trackpoints (TCX hat keine Summen) ───────────────
      let elevationGainM: number | undefined
      let elevationLossM: number | undefined
      if (samples.some(s => s.altM !== undefined)) {
        const el = elevation(samples)
        elevationGainM = round1(el.gainM)
        elevationLossM = round1(el.lossM)
      }

      resolve({
        activity: {
          type,
          date,
          startTime,
          source:    'garmin_import',
          durationMin,
          distanceKm,
          avgHr,
          maxHr:     maxHr > 0 ? maxHr : undefined,
          avgCadence,
          elevationGainM,
          elevationLossM,
          rawGarminData: {
            format:              'tcx',
            sport:               sportRaw,
            lapCount:            laps.length,
            totalTimeSeconds:    totalSec,
            totalDistanceMeters: totalMeters,
          } as Record<string, unknown>,
        },
        samples,
      })
    } catch (e) {
      reject(e)
    }
  })
}

/** Wählt den Parser nach Dateiendung (.fit / .tcx, Groß-/Kleinschreibung egal). */
export function parseGarminFile(fileName: string, buffer: Buffer): Promise<ParsedActivity> {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'tcx') return parseTcxFile(buffer)
  if (ext === 'fit') return parseFitFile(buffer)
  return Promise.reject(new Error('Nur .fit- und .tcx-Dateien werden unterstützt'))
}

// ── FIT type helpers ──────────────────────────────────────────────────────────

interface FitRecord {
  heart_rate?: number
  timestamp?: string | Date
  distance?: number
  altitude?: number
  enhanced_altitude?: number
}
interface FitLap { records?: FitRecord[] }
interface FitSession {
  sport?:               string
  start_time?:          string | Date
  total_elapsed_time?:  number
  total_timer_time?:    number
  total_distance?:      number
  total_ascent?:        number
  total_descent?:       number
  avg_heart_rate?:      number
  max_heart_rate?:      number
  avg_cadence?:         number
  laps?:                FitLap[]
}
export interface FitData {
  sessions?:  FitSession[]
  records?:   FitRecord[]
  activity?:  unknown
  sport?:     unknown
  [key: string]: unknown
}

// ── TCX type helpers ──────────────────────────────────────────────────────────

interface TcxHrValue { Value?: number | string }

interface TcxTrackpoint {
  Time?:           string
  HeartRateBpm?:   TcxHrValue
  DistanceMeters?: number | string
  AltitudeMeters?: number | string
}

interface TcxTrack {
  Trackpoint?: TcxTrackpoint | TcxTrackpoint[]
}

interface TcxLapExtLX {
  AvgRunCadence?:  number | string
  MaxRunCadence?:  number | string
  AvgBikeCadence?: number | string
  MaxBikeCadence?: number | string
  AvgSpeed?:       number | string
}

interface TcxLap {
  '@_StartTime'?:       string
  TotalTimeSeconds?:    number | string
  DistanceMeters?:      number | string
  AverageHeartRateBpm?: TcxHrValue
  MaximumHeartRateBpm?: TcxHrValue
  Cadence?:             number | string
  Track?:               TcxTrack | TcxTrack[]
  Extensions?:          { LX?: TcxLapExtLX }
}

interface TcxActivity {
  '@_Sport'?: string
  Id?:        string | number
  Lap?:       TcxLap | TcxLap[]
}

interface TcxRoot {
  TrainingCenterDatabase?: {
    Activities?: {
      Activity?: TcxActivity | TcxActivity[]
    }
  }
}
