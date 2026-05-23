import { ipcMain } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { IpcResponse, CreateActivityPayload } from '../../src/types/ipc'
import FitParser from 'fit-file-parser'
import { XMLParser } from 'fast-xml-parser'

interface GarminParsePayload {
  fileName: string
  data: number[]
}

export function registerGarminHandlers() {
  ipcMain.handle(
    IPC.GARMIN_PARSE,
    async (_e, payload: GarminParsePayload): Promise<IpcResponse<Partial<CreateActivityPayload>>> => {
      try {
        const buffer = Buffer.from(payload.data)
        const ext    = payload.fileName.toLowerCase().split('.').pop()

        const parsed = ext === 'tcx'
          ? await parseTcxFile(buffer)
          : await parseFitFile(buffer)

        return { success: true, data: parsed }
      } catch (err) {
        return { success: false, error: `Failed to parse file: ${String(err)}` }
      }
    }
  )
}

// ── FIT parser ────────────────────────────────────────────────────────────────

function parseFitFile(buffer: Buffer): Promise<Partial<CreateActivityPayload>> {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({ force: true, speedUnit: 'km/h', lengthUnit: 'km' })

    parser.parse(buffer, (error: Error | null, data: FitData) => {
      if (error) { reject(error); return }

      try {
        // fit-file-parser puts sessions at the top level, not under data.activity
        const sessions: FitSession[] =
          (Array.isArray(data.sessions) && data.sessions.length > 0 ? data.sessions : null) ??
          (Array.isArray((data.activity as any)?.sessions) ? (data.activity as any).sessions : null) ??
          []

        const session: FitSession = sessions[0] ?? {}

        const records: FitRecord[] =
          (Array.isArray(data.records) && data.records.length > 0 ? data.records : null) ??
          sessions.flatMap(s =>
            (s.laps ?? []).flatMap((l: FitLap) => l.records ?? [])
          ) ??
          []

        const sport = (session.sport ?? (data.sport as string) ?? '').toLowerCase()
        const type: CreateActivityPayload['type'] =
          sport.includes('run')                    ? 'running'  :
          sport.includes('cycl') || sport.includes('bike') ? 'cycling'  :
          sport.includes('swim')                   ? 'custom'   :
          'custom'

        const rawDate =
          session.start_time ??
          (records[0] as any)?.timestamp ??
          null
        const date = rawDate
          ? new Date(rawDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]
        const startTime = rawDate
          ? new Date(rawDate).toTimeString().slice(0, 5)
          : undefined

        let durationMin: number | undefined =
          session.total_elapsed_time != null
            ? Math.round(session.total_elapsed_time / 60)
            : session.total_timer_time != null
            ? Math.round(session.total_timer_time / 60)
            : undefined

        if (!durationMin && records.length >= 2) {
          const first = new Date((records[0] as any).timestamp).getTime()
          const last  = new Date((records[records.length - 1] as any).timestamp).getTime()
          if (!isNaN(first) && !isNaN(last) && last > first) {
            durationMin = Math.round((last - first) / 60000)
          }
        }

        let avgHr: number | undefined = session.avg_heart_rate ?? undefined
        let maxHr: number | undefined = session.max_heart_rate ?? undefined

        if ((!avgHr || !maxHr) && records.length > 0) {
          const hrs = records
            .map(r => r.heart_rate)
            .filter((h): h is number => typeof h === 'number' && h > 0)
          if (hrs.length > 0) {
            if (!avgHr) avgHr = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)
            if (!maxHr) maxHr = Math.max(...hrs)
          }
        }

        resolve({
          type,
          date,
          startTime,
          source: 'garmin_import',
          durationMin,
          distanceKm: session.total_distance ?? undefined,
          avgHr,
          maxHr,
          avgCadence: session.avg_cadence ?? undefined,
          rawGarminData: {
            format:      'fit',
            session,
            recordCount: records.length,
            sport,
            rawKeys:     Object.keys(data),
          } as Record<string, unknown>,
        })
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
//     > Lap[] > TotalTimeSeconds, DistanceMeters, HR fields, Cadence, Track > Trackpoint[]
//
// Namespace prefixes (ns3:LX etc.) are stripped by fast-xml-parser's removeNSPrefix.

function parseTcxFile(buffer: Buffer): Promise<Partial<CreateActivityPayload>> {
  return new Promise((resolve, reject) => {
    try {
      const xmlStr = buffer.toString('utf-8')

      const parserWithAttrs = new XMLParser({
        ignoreAttributes:    false,   // needed to read @_Sport attribute
        attributeNamePrefix: '@_',
        removeNSPrefix:      true,    // ns3:LX → LX, ns3:AvgRunCadence → AvgRunCadence
        parseAttributeValue: true,
        isArray: (name: string) =>
          name === 'Activity' || name === 'Lap' || name === 'Trackpoint',
      })

      const root: TcxRoot = parserWithAttrs.parse(xmlStr)

      // Navigate to Activities
      const db = root?.TrainingCenterDatabase
      if (!db) { reject(new Error('Not a valid TCX file — missing TrainingCenterDatabase root')); return }

      const activitiesEl = db.Activities
      if (!activitiesEl) { reject(new Error('No <Activities> element found in TCX file')); return }

      // Normalise to array
      const activities: TcxActivity[] = Array.isArray(activitiesEl.Activity)
        ? activitiesEl.Activity
        : activitiesEl.Activity
          ? [activitiesEl.Activity]
          : []

      if (activities.length === 0) { reject(new Error('No <Activity> element found in TCX file')); return }

      const activity = activities[0]

      // ── Sport → type ────────────────────────────────────────────────────────
      const sportRaw = (activity['@_Sport'] ?? '').toString()
      const sport    = sportRaw.toLowerCase()
      const type: CreateActivityPayload['type'] =
        sport.includes('run')                          ? 'running'  :
        sport.includes('bik') || sport.includes('cycl') ? 'cycling'  :
        sport.includes('swim')                         ? 'custom'   :
        'custom'

      // ── Date / start time from Activity.Id (ISO timestamp) ─────────────────
      const idStr = activity.Id ? String(activity.Id) : null
      const date  = idStr
        ? new Date(idStr).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
      const startTime = idStr
        ? new Date(idStr).toTimeString().slice(0, 5)
        : undefined

      // ── Laps ────────────────────────────────────────────────────────────────
      const laps: TcxLap[] = Array.isArray(activity.Lap)
        ? activity.Lap
        : activity.Lap
          ? [activity.Lap]
          : []

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
        const tpHrs: number[] = []
        for (const lap of laps) {
          const tps: TcxTrackpoint[] = Array.isArray(lap.Track?.Trackpoint)
            ? lap.Track!.Trackpoint as TcxTrackpoint[]
            : lap.Track?.Trackpoint
              ? [lap.Track.Trackpoint as TcxTrackpoint]
              : []
          for (const tp of tps) {
            const v = Number(tp.HeartRateBpm?.Value)
            if (v > 0) tpHrs.push(v)
          }
        }
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

      resolve({
        type,
        date,
        startTime,
        source:    'garmin_import',
        durationMin,
        distanceKm,
        avgHr,
        maxHr:     maxHr > 0 ? maxHr : undefined,
        avgCadence,
        rawGarminData: {
          format:              'tcx',
          sport:               sportRaw,
          lapCount:            laps.length,
          totalTimeSeconds:    totalSec,
          totalDistanceMeters: totalMeters,
        } as Record<string, unknown>,
      })
    } catch (e) {
      reject(e)
    }
  })
}

// ── FIT type helpers ──────────────────────────────────────────────────────────

interface FitRecord {
  heart_rate?: number
  timestamp?: string | Date
}
interface FitLap { records?: FitRecord[] }
interface FitSession {
  sport?:               string
  start_time?:          string | Date
  total_elapsed_time?:  number
  total_timer_time?:    number
  total_distance?:      number
  avg_heart_rate?:      number
  max_heart_rate?:      number
  avg_cadence?:         number
  laps?:                FitLap[]
}
interface FitData {
  sessions?:  FitSession[]
  records?:   FitRecord[]
  activity?:  unknown
  sport?:     unknown
  [key: string]: unknown
}

// ── TCX type helpers ──────────────────────────────────────────────────────────

interface TcxHrValue { Value?: number | string }

interface TcxTrackpoint {
  Time?:          string
  HeartRateBpm?:  TcxHrValue
  DistanceMeters?: number
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
  Track?:               TcxTrack
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
