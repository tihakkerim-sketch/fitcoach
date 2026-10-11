/**
 * intervals.icu-Sync: Aktivitäten (Datei bevorzugt, sonst Summenfelder) + Wellness (nur leere Felder).
 * Ohne `electron`-Import.
 */
import { eq } from 'drizzle-orm'
import { format, subDays } from 'date-fns'
import { activities, recoveryLogs } from '../../db/schema'
import { calcReadiness } from '../../src/lib/recoveryScore'
import type { CreateActivityPayload, SyncResult } from '../../src/types/ipc'
import { parseFitFile, parseTcxFile, type ParsedActivity } from './garminParse'
import { saveImported } from './importActivity'
import { IntervalsError, type IcuActivity, type IcuWellness, type IntervalsClient } from './intervalsClient'
import { runInTransaction, type TxDb } from './transaction'

export type { SyncResult }

export interface SyncOptions {
  now: Date
  lastSyncAt?: number
  /** Parser für die Original-Datei (Format per Inhalt erkannt); für Tests ersetzbar. */
  parseOriginal?: (data: Buffer) => Promise<ParsedActivity>
}

/** Format per Inhalt: beginnt (nach Leerraum/BOM) mit `<` → TCX, sonst FIT. */
export function parseOriginalFile(data: Buffer): Promise<ParsedActivity> {
  const head = data.subarray(0, 64).toString('utf-8').replace(/^﻿/, '').trimStart()
  return head.startsWith('<') ? parseTcxFile(data) : parseFitFile(data)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const round1 = (v: number) => Math.round(v * 10) / 10
const isPos = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

export function mapType(t: string | null | undefined): { type: CreateActivityPayload['type']; typeLabel?: string } {
  const s = (t ?? '').trim()
  if (s === 'Run' || s === 'TrailRun' || s === 'VirtualRun') return { type: 'running' }
  if (s.endsWith('Ride')) return { type: 'cycling' }
  if (s === 'WeightTraining') return { type: 'strength' }
  return s ? { type: 'custom', typeLabel: s.slice(0, 100) } : { type: 'custom' }
}

/** Datum/Uhrzeit direkt aus dem lokalen Zeitstempel schneiden (keine Zeitzonen-Umrechnung). */
function splitLocal(raw: string | null | undefined): { date: string; startTime?: string } | null {
  if (!raw) return null
  const date = raw.slice(0, 10)
  if (!DATE_RE.test(date)) return null
  const time = raw.slice(11, 16)
  return { date, startTime: TIME_RE.test(time) ? time : undefined }
}

const hrOk = (v: number | null | undefined): number | undefined =>
  typeof v === 'number' && v >= 30 && v <= 300 ? Math.round(v) : undefined

function summaryParsed(a: IcuActivity, local: { date: string; startTime?: string }): ParsedActivity | null {
  const seconds = isPos(a.elapsed_time) ? a.elapsed_time : isPos(a.moving_time) ? a.moving_time : null
  if (seconds === null || !local.startTime) return null
  const { type, typeLabel } = mapType(a.type)
  return {
    activity: {
      type, typeLabel,
      date: local.date,
      startTime: local.startTime,
      durationMin: Math.round(seconds / 60),
      movingTimeMin: isPos(a.moving_time) ? round1(a.moving_time / 60) : undefined,
      distanceKm: isPos(a.distance) ? Math.round(a.distance / 10) / 100 : undefined,
      elevationGainM: isPos(a.total_elevation_gain) ? Math.round(a.total_elevation_gain) : undefined,
      avgHr: hrOk(a.average_heartrate),
      maxHr: hrOk(a.max_heartrate),
      avgCadence: isPos(a.average_cadence) && a.average_cadence <= 300 ? Math.round(a.average_cadence) : undefined,
      notes: a.name ? a.name.slice(0, 2000) : undefined,
    },
    samples: [],
  }
}

async function syncActivities(db: TxDb, client: IntervalsClient, from: string, to: string, opts: SyncOptions, r: SyncResult) {
  const parse = opts.parseOriginal ?? parseOriginalFile
  const list = await client.listActivities(from, to)

  for (const a of list) {
    const idStr = String(a.id)
    const label = a.name ? `${a.name} (${idStr})` : idStr
    const externalId = `icu:${idStr}`
    try {
      const known = db.select({ id: activities.id }).from(activities).where(eq(activities.externalId, externalId)).get()
      if (known) { r.duplicates++; continue }

      const local = splitLocal(a.start_date_local)
      const { type, typeLabel } = mapType(a.type)

      let parsed: ParsedActivity | null = null
      const file = await client.downloadOriginal(idStr)
      if (file) {
        try {
          parsed = await parse(file)
        } catch {
          parsed = null // kaputte Datei → Summenfelder versuchen
        }
      }

      if (parsed) {
        parsed = {
          samples: parsed.samples,
          activity: {
            ...parsed.activity,
            type, typeLabel,
            ...(local ? { date: local.date, startTime: local.startTime ?? parsed.activity.startTime } : {}),
          },
        }
      } else if (local) {
        parsed = summaryParsed(a, local)
      }
      if (!parsed || !parsed.activity.date) { r.unavailable++; continue }

      const saved = saveImported(db, parsed, {
        externalId,
        source: 'intervals_icu',
        fileName: file ? `intervals-${idStr}` : undefined,
      })
      if (saved.status === 'created') r.created++
      else r.duplicates++
    } catch (err) {
      if (err instanceof IntervalsError && err.fatal) throw err
      r.errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

function syncWellness(db: TxDb, days: IcuWellness[], r: SyncResult, now: number) {
  runInTransaction(db, () => {
    for (const w of days) {
      const date = String(w.id)
      if (!DATE_RE.test(date)) continue
      const incoming = {
        hrvRmssd: isPos(w.hrv) && w.hrv <= 500 ? w.hrv : undefined,
        restingHr: isPos(w.restingHR) && w.restingHR >= 20 && w.restingHR <= 250 ? Math.round(w.restingHR) : undefined,
        sleepScore: isPos(w.sleepScore) && w.sleepScore <= 100 ? Math.round(w.sleepScore) : undefined,
        sleepHours: isPos(w.sleepSecs) && w.sleepSecs / 3600 <= 24 ? round1(w.sleepSecs / 3600) : undefined,
      }
      if (Object.values(incoming).every(v => v === undefined)) continue

      const existing = db.select().from(recoveryLogs).where(eq(recoveryLogs.date, date)).get()
      if (!existing) {
        db.insert(recoveryLogs).values({
          date,
          hrvRmssd: incoming.hrvRmssd ?? null,
          restingHr: incoming.restingHr ?? null,
          sleepScore: incoming.sleepScore ?? null,
          sleepHours: incoming.sleepHours ?? null,
          readinessScore: calcReadiness(incoming),
          source: 'intervals_icu',
          createdAt: now,
          updatedAt: now,
        }).run()
        r.recoveryDays++
        continue
      }

      const fill: Partial<typeof recoveryLogs.$inferInsert> = {}
      if (existing.hrvRmssd == null && incoming.hrvRmssd !== undefined) fill.hrvRmssd = incoming.hrvRmssd
      if (existing.restingHr == null && incoming.restingHr !== undefined) fill.restingHr = incoming.restingHr
      if (existing.sleepScore == null && incoming.sleepScore !== undefined) fill.sleepScore = incoming.sleepScore
      if (existing.sleepHours == null && incoming.sleepHours !== undefined) fill.sleepHours = incoming.sleepHours
      if (Object.keys(fill).length === 0) continue

      const merged = { ...existing, ...fill }
      db.update(recoveryLogs).set({
        ...fill,
        readinessScore: calcReadiness({
          bodyBattery: merged.bodyBattery, sleepScore: merged.sleepScore,
          hrvRmssd: merged.hrvRmssd, restingHr: merged.restingHr,
        }),
        updatedAt: now,
      }).where(eq(recoveryLogs.id, existing.id)).run()
      r.recoveryDays++
    }
  })
}

export async function runIntervalsSync(db: TxDb, client: IntervalsClient, opts: SyncOptions): Promise<SyncResult> {
  const from = format(opts.lastSyncAt ? subDays(new Date(opts.lastSyncAt), 2) : subDays(opts.now, 30), 'yyyy-MM-dd')
  const to = format(opts.now, 'yyyy-MM-dd')
  const result: SyncResult = {
    created: 0, duplicates: 0, unavailable: 0, recoveryDays: 0, errors: [],
    from, to, at: opts.now.getTime(),
  }

  await syncActivities(db, client, from, to, opts, result)

  try {
    syncWellness(db, await client.listWellness(from, to), result, opts.now.getTime())
  } catch (err) {
    if (err instanceof IntervalsError && err.fatal) throw err
    result.errors.push(`Recovery-Werte: ${err instanceof Error ? err.message : String(err)}`)
  }
  return result
}

let running: Promise<SyncResult> | null = null

/** Nur ein Sync gleichzeitig: ein laufender Sync wird wiederverwendet. */
export function runIntervalsSyncShared(db: TxDb, client: IntervalsClient, opts: SyncOptions): Promise<SyncResult> {
  if (running) return running
  const p = runIntervalsSync(db, client, opts).finally(() => { running = null })
  running = p
  return p
}
