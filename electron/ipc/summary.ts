import { ipcMain, dialog } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { IpcResponse, SummaryPayload } from '../../src/types/ipc'
import { getDb } from '../../db/index'
import {
  activities,
  trainingPlans,
  planPhases,
  planWeeks,
  planSessions,
  userProfile,
  hrZones,
} from '../../db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'
import * as fs from 'fs'
import { parseISO, getDay } from 'date-fns'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// dayOfWeek in DB: 1=Mon … 7=Sun
const DB_DAY_NAMES: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' }

function fmt(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function hrZoneLabel(hr: number, zones: Array<{ zoneNumber: number; minHr: number; maxHr: number; label: string }>): string {
  const zone = zones.find(z => hr >= z.minHr && hr <= z.maxHr)
  return zone ? `Z${zone.zoneNumber} — ${zone.label}` : ''
}

function buildMarkdown(dateFrom: string, dateTo: string): string {
  const db = getDb()
  const lines: string[] = []

  const push = (...s: string[]) => lines.push(...s)

  // ── Header ─────────────────────────────────────────────────────────────────
  push(
    '# FitCoach Weekly Training Summary',
    `**Period:** ${dateFrom} → ${dateTo}`,
    `**Generated:** ${new Date().toISOString().split('T')[0]}`,
    '',
    '---',
    '',
  )

  // ── Profile ────────────────────────────────────────────────────────────────
  const profile = db.select().from(userProfile).where(eq(userProfile.id, 1)).get()
  push('## Athlete Profile', '')
  if (profile) {
    push('| Field | Value |', '|-------|-------|')
    if (profile.name)              push(`| Name | ${profile.name} |`)
    if (profile.age)               push(`| Age | ${profile.age} |`)
    if (profile.maxHr)             push(`| Max HR | ${profile.maxHr} bpm |`)
    if (profile.restingHr)         push(`| Resting HR | ${profile.restingHr} bpm |`)
    if (profile.goalEvent)         push(`| Goal event | ${profile.goalEvent} |`)
    if (profile.goalFinishTime)    push(`| Target finish | ${profile.goalFinishTime} |`)
    if (profile.trainingDaysPerWeek) push(`| Training days/week | ${profile.trainingDaysPerWeek} |`)
    push('')
    if (profile.injuryNotes) push(`**Injury / health notes:** ${profile.injuryNotes}`, '')
  } else {
    push('_No profile set._', '')
  }

  // ── HR Zones ───────────────────────────────────────────────────────────────
  const zones = db.select().from(hrZones).all()
  if (zones.length > 0) {
    push('## Heart Rate Zones', '')
    push('| Zone | Label | Range |', '|------|-------|-------|')
    for (const z of zones) {
      push(`| Z${z.zoneNumber} | ${z.label} | ${z.minHr}–${z.maxHr} bpm |`)
    }
    push('')
  }

  push('---', '')

  // ── Active plan ────────────────────────────────────────────────────────────
  const activePlan = db.select().from(trainingPlans).where(eq(trainingPlans.isActive, 1)).get()
  if (activePlan) {
    push(
      `## Active Training Plan: ${activePlan.name}`,
      '',
    )
    if (activePlan.goalEvent) push(`**Goal event:** ${activePlan.goalEvent}`)
    if (activePlan.goalDate)  push(`**Goal date:** ${activePlan.goalDate}`)
    push('')

    // Find sessions that fall in or overlap the export window
    const phases = db.select().from(planPhases).where(eq(planPhases.planId, activePlan.id)).all()
    const allPlannedSessions: Array<{
      day: string; type: string; duration?: number | null; zone?: number | null; intensity?: string | null; status: string
    }> = []

    for (const phase of phases) {
      const weeks = db.select().from(planWeeks).where(eq(planWeeks.phaseId, phase.id)).all()
      for (const week of weeks) {
        const sessions = db.select().from(planSessions).where(eq(planSessions.weekId, week.id)).all()
        for (const s of sessions) {
          allPlannedSessions.push({
            day: DB_DAY_NAMES[s.dayOfWeek] ?? String(s.dayOfWeek),
            type: s.type,
            duration: s.targetDurationMin,
            zone: s.targetHrZone,
            intensity: s.intensityLabel,
            status: s.status,
          })
        }
      }
    }

    // Show all plan sessions (most users won't have hundreds)
    const weekSessions = allPlannedSessions.filter(s => s.status !== 'skipped')
    if (weekSessions.length > 0) {
      push('### All Planned Sessions', '')
      push('| Day | Type | Duration | Zone | Intensity | Status |')
      push('|-----|------|----------|------|-----------|--------|')
      for (const s of allPlannedSessions) {
        const dur = s.duration ? `${s.duration} min` : '—'
        const zone = s.zone ? `Z${s.zone}` : '—'
        const intensity = s.intensity ?? '—'
        push(`| ${s.day} | ${s.type} | ${dur} | ${zone} | ${intensity} | ${s.status} |`)
      }
      push('')
    }
  } else {
    push('## Training Plan', '', '_No active training plan._', '')
  }

  push('---', '')

  // ── Activities in range ────────────────────────────────────────────────────
  const activityRows = db
    .select()
    .from(activities)
    .where(and(gte(activities.date, dateFrom), lte(activities.date, dateTo)))
    .orderBy(activities.date)
    .all()

  push(`## Activities (${dateFrom} → ${dateTo})`, '')

  if (activityRows.length === 0) {
    push('_No activities logged in this period._', '')
  } else {
    for (const a of activityRows) {
      const dayName = DAY_NAMES[getDay(parseISO(a.date))]
      const typeLabel = a.type === 'custom' && a.typeLabel ? a.typeLabel : a.type
      const source = a.source === 'garmin_import' ? ' *(Garmin)*' : ''
      push(`### ${a.date} (${dayName}) — ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}${source}`, '')
      push('| Field | Value |', '|-------|-------|')
      if (a.durationMin)       push(`| Duration | ${fmt(a.durationMin)} |`)
      if (a.startTime)         push(`| Start time | ${a.startTime} |`)
      if (a.distanceKm)        push(`| Distance | ${Number(a.distanceKm).toFixed(2)} km |`)
      if (a.avgHr) {
        const zl = zones.length ? ` (${hrZoneLabel(a.avgHr, zones)})` : ''
        push(`| Avg HR | ${a.avgHr} bpm${zl} |`)
      }
      if (a.maxHr)             push(`| Max HR | ${a.maxHr} bpm |`)
      if (a.avgCadence)        push(`| Avg cadence | ${a.avgCadence} rpm |`)
      if (a.perceivedEffort)   push(`| Perceived effort | ${a.perceivedEffort}/10 |`)
      if (a.surfaceType)       push(`| Surface | ${a.surfaceType} |`)
      if (a.bedtime && a.wakeTime) push(`| Sleep | ${a.bedtime} → ${a.wakeTime} |`)
      if (a.sleepQuality)      push(`| Sleep quality | ${a.sleepQuality}/100 |`)
      push('')
      if (a.exercises) {
        try {
          const exs: Array<{ name: string; sets: number; reps: number }> = JSON.parse(a.exercises)
          if (exs.length) {
            push('**Exercises:**', '')
            push('| Exercise | Sets | Reps |', '|----------|------|------|')
            for (const ex of exs) push(`| ${ex.name} | ${ex.sets} | ${ex.reps} |`)
            push('')
          }
        } catch { /* ignore */ }
      }
      if (a.notes) push(`**Notes:** ${a.notes}`, '')
      push('')
    }
  }

  // ── Weekly stats ───────────────────────────────────────────────────────────
  push('---', '', '## Weekly Statistics', '')
  const runs     = activityRows.filter(a => a.type === 'running')
  const cycles   = activityRows.filter(a => a.type === 'cycling')
  const strength = activityRows.filter(a => a.type === 'strength')
  const sleeps   = activityRows.filter(a => a.type === 'sleep')
  const custom   = activityRows.filter(a => a.type === 'custom')

  push('| Metric | Value |', '|--------|-------|')
  push(`| Total activities | ${activityRows.length} |`)

  if (runs.length) {
    const totalRunMin = runs.reduce((s, a) => s + (a.durationMin ?? 0), 0)
    const totalRunKm  = runs.reduce((s, a) => s + (Number(a.distanceKm) || 0), 0)
    const avgHrs      = runs.filter(a => a.avgHr).map(a => a.avgHr!)
    push(`| Running sessions | ${runs.length} |`)
    if (totalRunMin)  push(`| Total run time | ${fmt(totalRunMin)} |`)
    if (totalRunKm)   push(`| Total run distance | ${totalRunKm.toFixed(2)} km |`)
    if (avgHrs.length) push(`| Avg run HR | ${Math.round(avgHrs.reduce((s, h) => s + h, 0) / avgHrs.length)} bpm |`)
  }
  if (cycles.length) {
    const totalCycleMin = cycles.reduce((s, a) => s + (a.durationMin ?? 0), 0)
    const totalCycleKm  = cycles.reduce((s, a) => s + (Number(a.distanceKm) || 0), 0)
    push(`| Cycling sessions | ${cycles.length} |`)
    if (totalCycleMin) push(`| Total cycle time | ${fmt(totalCycleMin)} |`)
    if (totalCycleKm)  push(`| Total cycle distance | ${totalCycleKm.toFixed(2)} km |`)
  }
  if (strength.length) push(`| Strength sessions | ${strength.length} |`)
  if (sleeps.length) {
    const avgQ = sleeps.filter(a => a.sleepQuality).map(a => a.sleepQuality!)
    push(`| Sleep sessions logged | ${sleeps.length} |`)
    if (avgQ.length) push(`| Avg sleep quality | ${Math.round(avgQ.reduce((s, q) => s + q, 0) / avgQ.length)}/100 |`)
  }
  if (custom.length) push(`| Other sessions | ${custom.length} |`)

  push('')

  // ── Suggested prompt ───────────────────────────────────────────────────────
  push(
    '---',
    '',
    '## How to Use This Summary with Claude',
    '',
    'Paste this entire file into [claude.ai](https://claude.ai) and add one of these prompts:',
    '',
    '**Evaluate the week:**',
    '> Analyse my training summary above. How well did I execute my plan? Note HR trends, effort levels, and anything worth adjusting.',
    '',
    '**Plan next week:**',
    '> Based on my training summary, suggest the sessions I should do next week, including type, duration, and target HR zone for each day.',
    '',
    '**Start a new plan phase:**',
    '> I have finished a training phase. Based on my data above, design the next training phase for me with phases, weekly session structure, and progression logic.',
    '',
  )

  return lines.join('\n')
}

export function registerSummaryHandlers() {
  ipcMain.handle(
    IPC.EXPORT_GENERATE_SUMMARY,
    async (_e, payload: SummaryPayload): Promise<IpcResponse<string>> => {
      try {
        const md = buildMarkdown(payload.dateFrom, payload.dateTo)
        return { success: true, data: md }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.EXPORT_SAVE_MD,
    async (_e, payload: { content: string; filename: string }): Promise<IpcResponse<string>> => {
      try {
        const { filePath, canceled } = await dialog.showSaveDialog({
          title: 'Save Training Summary',
          defaultPath: payload.filename,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        })
        if (canceled || !filePath) return { success: false, error: 'Cancelled' }
        fs.writeFileSync(filePath, payload.content, 'utf-8')
        return { success: true, data: filePath }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
