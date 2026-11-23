/**
 * Lauf-Export (deutsches Markdown) zum Einfügen in claude.ai. Ohne `electron`-Import.
 */
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { activities, activitySplits, planSessions, shoes } from '../../db/schema'
import { addDaysStr, formatPace, mondayOf } from '../../src/shared/planCalendar'
import { effectiveZones, zoneOf } from '../../src/shared/coach'
import { getActivePlanDetail, loadHrBasics, loadProfile, loadSavedZones } from './coachData'
import { dayName, fmtMin, oneLine, short, targetText } from './coachExport'
import { getSessionRow } from './planRead'
import type { TxDb } from './transaction'

const MAX_DAYS = 366
const DASH = '–'

const fix = (n: number, d = 1): string => n.toFixed(d)
const longDate = (d: string): string => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`
const paceOf = (sec: number | null | undefined): string => (sec && sec > 0 ? `${formatPace(sec)}/km` : DASH)
const elevText = (gain: number | null | undefined, loss: number | null | undefined, unit: string): string =>
  gain !== null && gain !== undefined
    ? `+${Math.round(gain)}${loss !== null && loss !== undefined ? `/−${Math.round(loss)}` : ''}${unit}`
    : DASH

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000)
}

export function buildRunsExport(db: TxDb, range: { dateFrom: string; dateTo: string }, today: string): string {
  if (range.dateFrom > range.dateTo) throw new Error('Startdatum liegt nach dem Enddatum.')
  if (daysBetween(range.dateFrom, range.dateTo) + 1 > MAX_DAYS) {
    throw new Error(`Der Zeitraum darf höchstens ${MAX_DAYS} Tage umfassen.`)
  }

  const L: string[] = []
  const push = (...s: string[]) => L.push(...s)

  const profile = loadProfile(db)
  const plan = getActivePlanDetail(db)
  const hr = loadHrBasics(db, today)
  const { zones } = effectiveZones(loadSavedZones(db), hr)

  const runs = db.select().from(activities)
    .where(and(eq(activities.type, 'running'), gte(activities.date, range.dateFrom), lte(activities.date, range.dateTo)))
    .all()
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.id - b.id)

  push(`# Läufe zur Auswertung – ${range.dateFrom} bis ${range.dateTo}`,
    `Erstellt: ${today}. Alle Werte aus FitCoach (Garmin/intervals.icu). Pace in min:s pro km.`, '')

  // ── Kontext ──
  push('## Kontext')
  if (hr) {
    push(`- Max-Puls ${hr.maxHr} bpm${hr.maxSource === 'observed' ? ' (geschätzt)' : ''}, `
      + `Ruhepuls ${hr.restHr} bpm${hr.restSource !== 'profile' ? ' (geschätzt)' : ''}`)
  }
  if (zones.length > 0) push(`- Puls-Zonen: ${zones.map(z => `Z${z.zoneNumber} ${z.minHr}–${z.maxHr}`).join(' · ')}`)
  const goal = profile?.goalEvent || plan?.goalEvent
  const goalParts = [
    goal ? `${goal}${plan?.goalDate ? ` (${plan.goalDate})` : ''}` : null,
    profile?.goalFinishTime ? `Zielzeit ${profile.goalFinishTime}` : null,
  ].filter(Boolean)
  if (goalParts.length > 0) push(`- Ziel: ${goalParts.join(' · ')}`)
  if (profile?.injuryNotes?.trim()) push(`- Verletzungen/Gesundheit: ${oneLine(profile.injuryNotes)}`)
  if (L[L.length - 1] === '## Kontext') push('- Keine Profildaten hinterlegt.')
  push('')

  // ── Überblick ──
  push('## Überblick')
  type Run = (typeof runs)[number]
  const kmOf = (a: Run): number => Number(a.distanceKm) || 0
  if (runs.length === 0) {
    push('Keine Läufe im Zeitraum.', '')
  } else {
    const totalKm = runs.reduce((s, a) => s + kmOf(a), 0)
    const totalMin = runs.reduce((s, a) => s + (a.durationMin ?? 0), 0)
    const paced = runs.filter(a => kmOf(a) > 0 && a.durationMin)
    const pacedKm = paced.reduce((s, a) => s + kmOf(a), 0)
    const pacedMin = paced.reduce((s, a) => s + (a.durationMin ?? 0), 0)
    const withHr = runs.filter(a => a.avgHr && a.durationMin)
    const hrMin = withHr.reduce((s, a) => s + (a.durationMin ?? 0), 0)
    const avgHr = hrMin > 0 ? Math.round(withHr.reduce((s, a) => s + (a.avgHr ?? 0) * (a.durationMin ?? 0), 0) / hrMin) : null
    push(`- Läufe: ${runs.length} · Distanz: ${fix(totalKm)} km · Zeit: ${fmtMin(totalMin)} · `
      + `Ø Pace ${pacedKm > 0 ? paceOf((pacedMin * 60) / pacedKm) : DASH} · `
      + `Ø Puls ${avgHr !== null ? `${avgHr} bpm (zeitgewichtet, nur Läufe mit Puls)` : DASH}`, '')
    push('| Woche ab (Mo) | Läufe | km | Zeit | längster Lauf |', '|---|---|---|---|---|')
    for (let w = mondayOf(range.dateFrom); w <= range.dateTo; w = addDaysStr(w, 7)) {
      const wEnd = addDaysStr(w, 6)
      const inWeek = runs.filter(a => a.date >= w && a.date <= wEnd)
      const wKm = inWeek.reduce((s, a) => s + kmOf(a), 0)
      const wMin = inWeek.reduce((s, a) => s + (a.durationMin ?? 0), 0)
      const longest = inWeek.reduce((m, a) => Math.max(m, kmOf(a)), 0)
      push(`| ${w} | ${inWeek.length} | ${fix(wKm)} km | ${inWeek.length ? fmtMin(wMin) : DASH} | ${inWeek.length ? `${fix(longest)} km` : DASH} |`)
    }
    push('')
  }

  if (runs.length > 0) {
    const ids = runs.map(a => a.id)
    const splitsBy = new Map<number, (typeof activitySplits.$inferSelect)[]>()
    for (const sp of db.select().from(activitySplits).where(inArray(activitySplits.activityId, ids))
      .orderBy(asc(activitySplits.activityId), asc(activitySplits.splitIndex)).all()) {
      const arr = splitsBy.get(sp.activityId) ?? []
      arr.push(sp)
      splitsBy.set(sp.activityId, arr)
    }
    const shoeNames = new Map(db.select().from(shoes).all().map(s => [s.id, s.name]))
    const sessionByActivity = new Map<number, number>()
    for (const s of db.select({ id: planSessions.id, linked: planSessions.linkedActivityId }).from(planSessions)
      .where(inArray(planSessions.linkedActivityId, ids)).all()) {
      if (s.linked !== null) sessionByActivity.set(s.linked, s.id)
    }

    push('## Läufe')
    for (const a of runs) {
      const km = kmOf(a)
      const sessionId = sessionByActivity.get(a.id)
      const session = sessionId !== undefined ? getSessionRow(db, sessionId) : null
      const plannedBit = session
        ? ` · Plan: „${session.title ?? 'Einheit'}“ (Soll: ${targetText(session)})`
        : ' · ungeplant'
      push(`### ${dayName(a.date)} ${longDate(a.date)} · ${km > 0 ? `${fix(km, 2)} km` : DASH}${plannedBit}`)

      const z = a.avgHr ? zoneOf(a.avgHr, zones) : null
      push('| Zeit | Bewegt | Pace | Ø Puls | Max Puls | Höhenmeter | Kadenz | RPE |', '|---|---|---|---|---|---|---|---|')
      push(`| ${a.durationMin ? fmtMin(a.durationMin) : DASH} | ${a.movingTimeMin ? fmtMin(a.movingTimeMin) : DASH} `
        + `| ${km > 0 && a.durationMin ? paceOf((a.durationMin * 60) / km) : DASH} `
        + `| ${a.avgHr ? `${a.avgHr} bpm${z ? ` (Z${z})` : ''}` : DASH} | ${a.maxHr ? `${a.maxHr} bpm` : DASH} `
        + `| ${elevText(a.elevationGainM, a.elevationLossM, ' m')} `
        + `| ${a.avgCadence ? `${a.avgCadence} spm` : DASH} | ${a.perceivedEffort ? `${a.perceivedEffort}/10` : DASH} |`)

      if (a.hrZoneDistribution) {
        try {
          const d = JSON.parse(a.hrZoneDistribution) as Record<string, number>
          const txt = [1, 2, 3, 4, 5].filter(i => typeof d[`z${i}`] === 'number').map(i => `Z${i} ${Math.round(d[`z${i}`])} %`)
          if (txt.length > 0) push(`- Puls-Zonen-Zeit: ${txt.join(' · ')}`)
        } catch { /* kaputtes JSON ignorieren */ }
      }
      const sp = splitsBy.get(a.id)
      if (sp && sp.length > 0) {
        push('- Splits:', '| km | Pace | Ø Puls | Hm |', '|---|---|---|---|')
        for (const x of sp) {
          const pace = x.paceSecPerKm ?? (x.distanceKm > 0 ? x.durationSec / x.distanceKm : null)
          const label = x.distanceKm < 0.95 || x.distanceKm > 1.05 ? `${x.splitIndex} (${fix(x.distanceKm, 2)} km)` : `${x.splitIndex}`
          push(`| ${label} | ${paceOf(pace)} | ${x.avgHr ? x.avgHr : DASH} | ${elevText(x.elevationGainM, x.elevationLossM, '')} |`)
        }
      }
      if (a.pain === 1) push('- Beschwerden: ja')
      if (a.notes?.trim()) push(`- Notiz: „${oneLine(a.notes)}“`)
      if (a.shoeId !== null && shoeNames.has(a.shoeId)) push(`- Schuh: ${shoeNames.get(a.shoeId)}`)
      if (session) {
        const st = session.status === 'completed' ? 'erledigt' : session.status === 'skipped' ? 'übersprungen' : 'geplant'
        push(`- Plan-Status: ${st} · ${session.title ?? 'Einheit'} am ${short(session.date)} (Soll: ${targetText(session)})`)
      }
      push('')
    }
  }

  push('## Bitte auswerten',
    'Bewerte meine Läufe in diesem Zeitraum als Lauftrainer:',
    '1. Wie entwickeln sich Pace und Puls bei ähnlichen Läufen (aerobe Form)?',
    '2. Passen Intensitätsverteilung und Umfang zu meinem Ziel?',
    '3. Auffälligkeiten (Pulsdrift, zu schnelle lockere Läufe, Beschwerden)?',
    '4. Drei konkrete Empfehlungen für die nächsten zwei Wochen.', '')
  return L.join('\n')
}
