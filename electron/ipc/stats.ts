import { ipcMain } from 'electron'
import { IPC } from '../../src/types/ipc'
import type {
  IpcResponse, StatsResult, WeeklyBucket, ZoneBucket,
  ActivityTypeBucket, PersonalRecords,
} from '../../src/types/ipc'
import { getDb } from '../../db/index'
import { activities, hrZones } from '../../db/schema'
import { gte } from 'drizzle-orm'
import {
  format, subDays, startOfWeek, getISOWeek, getYear,
  parseISO, differenceInCalendarDays,
} from 'date-fns'

// ── Zone multiplier for training load ─────────────────────────────────────────
// Z1=1.0  Z2=1.5  Z3=2.5  Z4=3.5  Z5=5.0  unknown=1.0
const ZONE_MULT = [1.0, 1.5, 2.5, 3.5, 5.0]

function zoneMultiplier(
  avgHr: number | null,
  zones: Array<{ zoneNumber: number; minHr: number; maxHr: number }>,
): number {
  if (!avgHr || zones.length === 0) return 1.0
  const z = zones.find(z => avgHr >= z.minHr && avgHr <= z.maxHr)
  return z ? (ZONE_MULT[z.zoneNumber - 1] ?? 1.0) : 1.0
}

export function registerStatsHandlers() {
  ipcMain.handle(
    IPC.STATS_GET,
    async (): Promise<IpcResponse<StatsResult>> => {
      try {
        const db = getDb()

        const twelveWeeksAgo = format(subDays(new Date(), 84), 'yyyy-MM-dd')
        const recentRows = db.select().from(activities).where(gte(activities.date, twelveWeeksAgo)).all()
        const allRows    = db.select().from(activities).all()
        const zones      = db.select().from(hrZones).all()

        // ── All-time totals ───────────────────────────────────────────────────
        const sleepRows    = allRows.filter(a => a.type === 'sleep')
        const trainingRows = allRows.filter(a => a.type !== 'sleep')

        const totalActivities       = trainingRows.length
        const totalSleepSessions    = sleepRows.length
        const sleepQualities        = sleepRows.filter(a => a.sleepQuality).map(a => a.sleepQuality!)
        const avgSleepQuality       = sleepQualities.length
          ? Math.round(sleepQualities.reduce((s, q) => s + q, 0) / sleepQualities.length)
          : null

        const totalRunKm            = trainingRows.filter(a => a.type === 'running')
          .reduce((s, a) => s + (Number(a.distanceKm) || 0), 0)
        const totalRunMin           = trainingRows.filter(a => a.type === 'running')
          .reduce((s, a) => s + (a.durationMin ?? 0), 0)
        const totalCycleKm          = trainingRows.filter(a => a.type === 'cycling')
          .reduce((s, a) => s + (Number(a.distanceKm) || 0), 0)
        const totalStrengthSessions = trainingRows.filter(a => a.type === 'strength').length

        const runHrs   = trainingRows.filter(a => a.type === 'running' && a.avgHr).map(a => a.avgHr!)
        const avgRunHr = runHrs.length
          ? Math.round(runHrs.reduce((s, h) => s + h, 0) / runHrs.length)
          : null

        // ── Streak ───────────────────────────────────────────────────────────
        const activeDates = [...new Set(
          allRows.filter(a => a.type !== 'sleep').map(a => a.date),
        )].sort().reverse()

        let currentStreak = 0
        let longestStreak = 0
        let tempStreak    = 1
        const today     = format(new Date(), 'yyyy-MM-dd')
        const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

        if (activeDates.length > 0 && (activeDates[0] === today || activeDates[0] === yesterday)) {
          currentStreak = 1
          for (let i = 1; i < activeDates.length; i++) {
            const diff = differenceInCalendarDays(parseISO(activeDates[i - 1]), parseISO(activeDates[i]))
            if (diff === 1) { currentStreak++; tempStreak++ }
            else break
          }
        }
        for (let i = 1; i < activeDates.length; i++) {
          const diff = differenceInCalendarDays(parseISO(activeDates[i - 1]), parseISO(activeDates[i]))
          if (diff === 1) tempStreak++
          else { longestStreak = Math.max(longestStreak, tempStreak); tempStreak = 1 }
        }
        longestStreak = Math.max(longestStreak, tempStreak, currentStreak)

        // ── Weekly buckets (last 12 weeks) ────────────────────────────────────
        const weekMap = new Map<string, WeeklyBucket>()
        for (let w = 11; w >= 0; w--) {
          const anchor    = subDays(new Date(), w * 7)
          const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
          const key       = `${getYear(weekStart)}-W${String(getISOWeek(weekStart)).padStart(2, '0')}`
          const label     = format(weekStart, 'MMM d')
          weekMap.set(key, {
            week: key, label,
            runKm: 0, cycleKm: 0, runMin: 0, cycleMin: 0,
            strengthSessions: 0, otherMin: 0, totalSessions: 0,
            avgPaceSecPerKm: null,  // computed after loop
            trainingLoad: 0,
          })
        }

        for (const a of recentRows) {
          const d   = parseISO(a.date)
          const ws  = startOfWeek(d, { weekStartsOn: 1 })
          const key = `${getYear(ws)}-W${String(getISOWeek(ws)).padStart(2, '0')}`
          const bucket = weekMap.get(key)
          if (!bucket) continue

          if (a.type === 'running') {
            bucket.runKm  += Number(a.distanceKm) || 0
            bucket.runMin += a.durationMin ?? 0
          } else if (a.type === 'cycling') {
            bucket.cycleKm += Number(a.distanceKm) || 0
          } else if (a.type === 'strength') {
            bucket.strengthSessions++
          } else if (a.type !== 'sleep') {
            bucket.otherMin += a.durationMin ?? 0
          }

          // Total sessions + training load — all types except sleep
          if (a.type !== 'sleep') {
            bucket.totalSessions++
            if (a.durationMin) {
              bucket.trainingLoad += a.durationMin * zoneMultiplier(a.avgHr, zones)
            }
          }
        }

        // Post-process: round load, compute pace
        const weekly: WeeklyBucket[] = [...weekMap.values()].map(b => ({
          ...b,
          trainingLoad:    Math.round(b.trainingLoad),
          avgPaceSecPerKm: b.runKm > 0.01
            ? Math.round((b.runMin * 60) / b.runKm)
            : null,
        }))

        // ── HR zone distribution ──────────────────────────────────────────────
        const zoneMinutes: Record<string, number> = {}
        for (const a of recentRows) {
          if (!a.avgHr || !a.durationMin) continue
          const z   = zones.find(z => a.avgHr! >= z.minHr && a.avgHr! <= z.maxHr)
          const key = z ? `Z${z.zoneNumber}` : 'No HR'
          zoneMinutes[key] = (zoneMinutes[key] ?? 0) + a.durationMin
        }
        const zoneBuckets: ZoneBucket[] = zones.length > 0
          ? ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].map(z => ({ zone: z, minutes: zoneMinutes[z] ?? 0 }))
          : Object.entries(zoneMinutes).map(([zone, minutes]) => ({ zone, minutes }))

        // ── Activity type breakdown ───────────────────────────────────────────
        const typeCount: Record<string, number> = {}
        for (const a of allRows) {
          const t = a.type === 'custom' && a.typeLabel ? a.typeLabel : a.type
          typeCount[t] = (typeCount[t] ?? 0) + 1
        }
        const byType: ActivityTypeBucket[] = Object.entries(typeCount)
          .map(([type, count]) => ({ type: type.charAt(0).toUpperCase() + type.slice(1), count }))
          .sort((a, b) => b.count - a.count)

        // ── Personal Records ──────────────────────────────────────────────────
        let fastestPaceSecPerKm: number | null = null
        let fastestPaceDate:     string | null = null
        let longestRunKm:        number | null = null
        let longestRunDate:      string | null = null

        for (const a of allRows) {
          if (a.type !== 'running') continue
          const km  = Number(a.distanceKm) || 0
          const min = a.durationMin ?? 0

          if (km > 0 && min > 0) {
            const pace = (min * 60) / km
            if (fastestPaceSecPerKm === null || pace < fastestPaceSecPerKm) {
              fastestPaceSecPerKm = pace
              fastestPaceDate     = a.date
            }
          }
          if (km > (longestRunKm ?? 0)) {
            longestRunKm   = km
            longestRunDate = a.date
          }
        }

        // Best week by run km — scan all-time
        const allWeekKm = new Map<string, { label: string; km: number }>()
        for (const a of allRows) {
          if (a.type !== 'running') continue
          const km  = Number(a.distanceKm) || 0
          if (!km) continue
          const ws  = startOfWeek(parseISO(a.date), { weekStartsOn: 1 })
          const key = `${getYear(ws)}-W${String(getISOWeek(ws)).padStart(2, '0')}`
          const existing = allWeekKm.get(key)
          if (existing) existing.km += km
          else allWeekKm.set(key, { label: format(ws, 'MMM d, yyyy'), km })
        }
        let bestWeekKm:    number | null = null
        let bestWeekLabel: string | null = null
        for (const [, v] of allWeekKm) {
          if (bestWeekKm === null || v.km > bestWeekKm) {
            bestWeekKm    = v.km
            bestWeekLabel = v.label
          }
        }

        const personalRecords: PersonalRecords = {
          fastestPaceSecPerKm: fastestPaceSecPerKm !== null
            ? Math.round(fastestPaceSecPerKm) : null,
          fastestPaceDate,
          longestRunKm:  longestRunKm  !== null ? Math.round(longestRunKm * 100) / 100 : null,
          longestRunDate,
          bestWeekKm:    bestWeekKm    !== null ? Math.round(bestWeekKm * 10) / 10 : null,
          bestWeekLabel,
        }

        return {
          success: true,
          data: {
            totalActivities,
            totalSleepSessions,
            avgSleepQuality,
            totalRunKm:          Math.round(totalRunKm * 10) / 10,
            totalRunMin,
            totalCycleKm:        Math.round(totalCycleKm * 10) / 10,
            totalStrengthSessions,
            currentStreak,
            longestStreak,
            avgRunHr,
            weekly,
            zones:               zoneBuckets,
            byType,
            personalRecords,
          },
        }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
