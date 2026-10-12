/**
 * Coach-Bericht (deutsches Markdown) zum Einfügen in claude.ai. Ohne `electron`-Import.
 */
import { and, asc, gte, inArray, lte } from 'drizzle-orm'
import { activities, activitySplits, dailyCheckins } from '../../db/schema'
import { addDaysStr, formatPace, isMissed, mondayOf } from '../../src/shared/planCalendar'
import {
  COACH_CHANGES_FORMAT, FORM_TEXT, activityTrimp, effectiveZones, formatDuration, zoneOf,
  type HrBasics, type Prognosis,
} from '../../src/shared/coach'
import type { SessionRow } from '../../src/types/ipc'
import {
  getActivePlanDetail, getCoachStatus, loadHrBasics, loadProfile, loadRecoveryLogs, loadSavedZones, toCoachActivity,
} from './coachData'
import type { TxDb } from './transaction'

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const TYPE_DE: Record<string, string> = {
  running: 'Lauf', cycling: 'Rad', strength: 'Kraft', rest: 'Ruhetag', custom: 'Sonstiges', sleep: 'Schlaf',
}

/** "dd.MM." aus YYYY-MM-DD */
const short = (d: string): string => `${d.slice(8, 10)}.${d.slice(5, 7)}.`
const dayName = (d: string): string => DAYS[(new Date(`${d}T12:00:00`).getDay() + 6) % 7]
const nf = (n: number, digits = 1): string => n.toFixed(digits).replace('.', ',')
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

function fmtMin(min: number): string {
  const total = Math.round(min)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`
}

/** Soll einer Einheit kompakt: "8 km · 6:00–6:20/km · Z2" */
function targetText(s: SessionRow): string {
  const parts: string[] = []
  if (s.targetDistanceKm) parts.push(`${s.targetDistanceKm} km`)
  if (s.targetDurationMin) parts.push(`${s.targetDurationMin} min`)
  if (s.targetPaceFastSec) {
    const slow = s.targetPaceSlowSec ?? s.targetPaceFastSec
    parts.push(slow === s.targetPaceFastSec ? `${formatPace(slow)}/km` : `${formatPace(s.targetPaceFastSec)}–${formatPace(slow)}/km`)
  }
  if (s.targetHrZone) parts.push(`Z${s.targetHrZone}`)
  if (s.steps && s.steps.length > 0) parts.push('Intervalle')
  return parts.length ? parts.join(' · ') : '—'
}

function progStatusText(p: Prognosis): string {
  switch (p.status) {
    case 'onTrack': return 'auf Kurs'
    case 'close': return 'knapp'
    case 'offTrack': return 'nicht auf Kurs'
    default: return 'kein Ziel gesetzt'
  }
}

export function buildCoachReport(db: TxDb, today: string, range: { dateFrom: string; dateTo: string }): string {
  const L: string[] = []
  const push = (...s: string[]) => L.push(...s)

  const profile = loadProfile(db)
  const status = getCoachStatus(db, today)
  const plan = getActivePlanDetail(db)
  const hr: HrBasics | null = status.hr ?? loadHrBasics(db, today)
  const planSessions = plan ? plan.weeks.flatMap(w => w.sessions) : []

  push('# FitCoach – Coach-Bericht', `Stand: ${today} (${dayName(today)}) · Zeitraum der Aktivitäten: ${range.dateFrom} bis ${range.dateTo}`, '')

  // ── Profil ──
  push('## Profil')
  if (profile) {
    if (profile.name) push(`- Name: ${profile.name}`)
    if (profile.age) push(`- Alter: ${profile.age}`)
    if (hr) {
      push(`- Max-Puls: ${hr.maxHr} bpm${hr.maxSource === 'observed' ? ' (geschätzt: höchster gemessener Lauf-Puls)' : ''}`)
      push(`- Ruhepuls: ${hr.restHr} bpm${hr.restSource === 'recovery' ? ' (geschätzt: Median Recovery 30 Tage)' : hr.restSource === 'default' ? ' (geschätzt: Standardwert)' : ''}`)
    } else {
      if (profile.maxHr) push(`- Max-Puls: ${profile.maxHr} bpm`)
      if (profile.restingHr) push(`- Ruhepuls: ${profile.restingHr} bpm`)
    }
    const goal = profile.goalEvent || plan?.goalEvent
    if (goal) push(`- Ziel: ${goal}${plan?.goalDate ? ` (${plan.goalDate})` : ''}`)
    if (profile.goalFinishTime) push(`- Zielzeit: ${profile.goalFinishTime}`)
    if (profile.trainingDaysPerWeek) push(`- Trainingstage pro Woche: ${profile.trainingDaysPerWeek}`)
    if (profile.injuryNotes?.trim()) push(`- **Verletzungen/Gesundheit:** ${oneLine(profile.injuryNotes)}`)
  } else {
    push('_Kein Profil angelegt._')
    if (hr) push(`- Max-Puls ${hr.maxHr} bpm, Ruhepuls ${hr.restHr} bpm (geschätzt)`)
  }
  push('')

  // ── Zonen ──
  const { zones, source } = effectiveZones(loadSavedZones(db), hr)
  if (zones.length > 0) {
    push(`## Puls-Zonen (${source === 'saved' ? 'gespeichert' : 'berechnet nach Karvonen'})`)
    push('| Zone | Name | Puls |', '|---|---|---|')
    for (const z of zones) push(`| Z${z.zoneNumber} | ${z.label} | ${z.minHr}–${z.maxHr} |`)
    push('')
  }

  // ── Status ──
  push('## Status')
  if (status.current && status.form) {
    push(`- Fitness (CTL): ${nf(status.current.ctl)}`)
    push(`- Ermüdung (ATL): ${nf(status.current.atl)}`)
    push(`- Form (TSB): ${nf(status.current.tsb)} – ${FORM_TEXT[status.form]}`)
  } else {
    push('- Noch keine Belastungsdaten.')
  }
  if (status.ramp.warnings.length > 0) {
    push('', '**Warnungen:**')
    for (const w of status.ramp.warnings) push(`- ${w.level === 'warn' ? 'Warnung' : 'Hinweis'}: ${w.text}`)
  } else {
    push('- Keine Steigerungs-Warnungen.')
  }
  const p = status.prognosis
  if (p) {
    push('', `**Prognose ${p.targetLabel}:** ${formatDuration(p.predictedSec)} (Pace ${formatPace(p.predictedPaceSec)}/km), `
      + `Basis: Lauf vom ${p.basedOn.date} (${nf(p.basedOn.distanceKm)} km in ${formatDuration(p.basedOn.durationSec)}).`)
    if (p.goalSec !== null) {
      push(`Zielzeit ${formatDuration(p.goalSec)} → ${progStatusText(p)}; nötige Pace ${p.requiredPaceSec !== null ? formatPace(p.requiredPaceSec) : '—'}/km.`)
    }
    push('_Hinweis: Trainingsläufe unterschätzen die Wettkampfform meist._')
  }
  push('')

  // ── Diese Woche ──
  const weekFrom = mondayOf(today)
  const weekTo = addDaysStr(weekFrom, 6)
  const allActs = db.select().from(activities)
    .where(and(gte(activities.date, addDaysStr(weekFrom, -21)), lte(activities.date, today)))
    .orderBy(asc(activities.date)).all()
  push(`## Diese Woche (${short(weekFrom)}–${short(weekTo)}) Soll vs. Ist`)
  const weekSessions = planSessions.filter(s => s.date >= weekFrom && s.date <= weekTo)
  if (weekSessions.length > 0) {
    push('| Datum | Tag | Einheit | Soll | Status | Ist |', '|---|---|---|---|---|---|')
    for (const s of weekSessions) {
      const st = s.status === 'completed' ? 'erledigt' : s.status === 'skipped' ? 'übersprungen'
        : isMissed(s, s.date, today) ? 'verpasst' : 'geplant'
      const ist = s.activity
        ? [s.activity.distanceKm ? `${nf(Number(s.activity.distanceKm))} km` : null,
           s.activity.durationMin ? fmtMin(s.activity.durationMin) : null].filter(Boolean).join(', ') || '—'
        : '—'
      push(`| ${short(s.date)} | ${dayName(s.date)} | ${s.title ?? TYPE_DE[s.type] ?? s.type} | ${targetText(s)} | ${st} | ${ist} |`)
    }
  } else {
    push(plan ? '_Diese Woche keine geplanten Einheiten._' : '_Kein aktiver Trainingsplan._')
  }
  const linkedIds = new Set(planSessions.map(s => s.linkedActivityId).filter((x): x is number => x !== null))
  const unplanned = allActs.filter(a => a.type === 'running' && a.date >= weekFrom && a.date <= weekTo && !linkedIds.has(a.id))
  if (unplanned.length > 0) {
    push('', 'Ungeplante Läufe diese Woche: ' + unplanned.map(a =>
      `${short(a.date)} ${nf(Number(a.distanceKm) || 0)} km${a.durationMin ? ` in ${fmtMin(a.durationMin)}` : ''}`).join('; '))
  }
  push('')

  // ── Letzte 4 Wochen ──
  push('## Letzte 4 Wochen (Mo–So)', '| Woche ab | km | Läufe | längster Lauf | Belastung (TRIMP) |', '|---|---|---|---|---|')
  for (let i = 3; i >= 0; i--) {
    const from = addDaysStr(weekFrom, -7 * i)
    const to = addDaysStr(from, 6)
    const inWeek = allActs.filter(a => a.date >= from && a.date <= to)
    const runs = inWeek.filter(a => a.type === 'running')
    const km = runs.reduce((s, a) => s + (Number(a.distanceKm) || 0), 0)
    const longest = runs.reduce((m, a) => Math.max(m, Number(a.distanceKm) || 0), 0)
    const load = inWeek.reduce((s, a) => s + activityTrimp(toCoachActivity(a), hr), 0)
    push(`| ${short(from)}${i === 0 ? ' (laufend)' : ''} | ${nf(km)} | ${runs.length} | ${nf(longest)} km | ${Math.round(load)} |`)
  }
  push('')

  // ── Recovery ──
  const rec = status.recovery
  const pair = (a: number | null, b: number | null): string =>
    [a !== null ? `7 Tage ${a}` : null, b !== null ? `30 Tage ${b}` : null].filter(Boolean).join(' · ')
  const recLines: string[] = []
  if (rec.hrvToday !== null || rec.hrv7 !== null || rec.hrv30 !== null) {
    const parts = [
      rec.hrvToday !== null ? `heute ${rec.hrvToday}` : null,
      rec.hrv7 !== null ? `7 Tage ${rec.hrv7}` : null,
      rec.hrv30 !== null ? `30 Tage ${rec.hrv30}` : null,
    ].filter(Boolean)
    recLines.push(`- HRV (ms): ${parts.join(' · ')}`)
  }
  if (rec.hrvDeltaPct !== null) recLines.push(`- HRV heute vs. 30-Tage-Schnitt: ${rec.hrvDeltaPct > 0 ? '+' : ''}${rec.hrvDeltaPct} %`)
  if (rec.rhr7 !== null || rec.rhr30 !== null) recLines.push(`- Ruhepuls (bpm): ${pair(rec.rhr7, rec.rhr30)}`)
  if (rec.sleep7 !== null || rec.sleep30 !== null) recLines.push(`- Schlaf (h): ${pair(rec.sleep7, rec.sleep30)}`)
  const noteFrom = addDaysStr(today, -13)
  const recNotes = loadRecoveryLogs(db, noteFrom, today).filter(l => l.note?.trim())
  const checkins = db.select().from(dailyCheckins)
    .where(and(gte(dailyCheckins.date, noteFrom), lte(dailyCheckins.date, today)))
    .orderBy(asc(dailyCheckins.date)).all()
  const checkinLines: string[] = []
  for (const c of checkins) {
    if (c.morningIntention?.trim()) checkinLines.push(`- ${short(c.date)} Vorsatz: ${oneLine(c.morningIntention)}`)
    if (c.eveningNote?.trim()) checkinLines.push(`- ${short(c.date)} Abend: ${oneLine(c.eveningNote)}`)
  }
  const feelings = loadRecoveryLogs(db, noteFrom, today).filter(l => l.feeling !== null)
  if (feelings.length > 0) {
    recLines.push(`- Befinden (14 Tage, 1–5): ${feelings.map(l => `${short(l.date)} ${l.feeling}`).join(' · ')}`)
  }
  if (recLines.length > 0 || recNotes.length > 0 || checkinLines.length > 0) {
    push('## Recovery-Trend', ...recLines)
    if (recNotes.length > 0) {
      push('', 'Recovery-Notizen (14 Tage):')
      for (const l of recNotes) push(`- ${short(l.date)}: ${oneLine(l.note ?? '')}`)
    }
    if (checkinLines.length > 0) push('', 'Check-in-Notizen (14 Tage):', ...checkinLines)
    push('')
  }

  // ── Aktivitäten im Zeitraum ──
  const rangeActs = db.select().from(activities)
    .where(and(gte(activities.date, range.dateFrom), lte(activities.date, range.dateTo)))
    .orderBy(asc(activities.date), asc(activities.id)).all()
    .filter(a => a.type !== 'sleep')
  push(`## Aktivitäten im Zeitraum (${range.dateFrom} bis ${range.dateTo})`)
  if (rangeActs.length === 0) {
    push('_Keine Aktivitäten im Zeitraum._')
  } else {
    const splitRows = db.select().from(activitySplits)
      .where(inArray(activitySplits.activityId, rangeActs.map(a => a.id)))
      .orderBy(asc(activitySplits.activityId), asc(activitySplits.splitIndex)).all()
    const splitsBy = new Map<number, typeof splitRows>()
    for (const sp of splitRows) {
      const arr = splitsBy.get(sp.activityId) ?? []
      arr.push(sp)
      splitsBy.set(sp.activityId, arr)
    }
    for (const a of rangeActs) {
      const label = a.type === 'custom' && a.typeLabel ? a.typeLabel : TYPE_DE[a.type] ?? a.type
      const km = Number(a.distanceKm) || 0
      const parts: string[] = [`${short(a.date)} ${dayName(a.date)}`, label]
      if (km > 0) parts.push(`${nf(km, 2)} km`)
      if (a.durationMin) parts.push(fmtMin(a.durationMin))
      if (km > 0 && a.durationMin) parts.push(`${formatPace((a.durationMin * 60) / km)}/km`)
      if (a.avgHr) {
        const z = zoneOf(a.avgHr, zones)
        parts.push(`Ø ${a.avgHr} bpm${z ? ` (Z${z})` : ''}`)
      }
      if (a.elevationGainM) parts.push(`${Math.round(a.elevationGainM)} Hm`)
      if (a.perceivedEffort) parts.push(`RPE ${a.perceivedEffort}`)
      if (a.notes?.trim()) parts.push(`„${oneLine(a.notes)}“`)
      push(`- ${parts.join(' · ')}`)
      const sp = splitsBy.get(a.id)
      if (a.type === 'running' && sp && sp.length > 0) {
        const paces = sp.map(x => x.paceSecPerKm ?? (x.distanceKm > 0 ? x.durationSec / x.distanceKm : null))
          .filter((x): x is number => x !== null).map(formatPace)
        if (paces.length > 0) push(`  - Splits: ${paces.join(', ')}`)
      }
    }
  }
  push('')

  // ── Kommende 14 Tage ──
  const upTo = addDaysStr(today, 13)
  const upcoming = planSessions
    .filter(s => s.date >= today && s.date <= upTo && s.type !== 'rest' && s.status === 'planned')
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  push(`## Kommende 14 Tage (${short(today)}–${short(upTo)})`)
  if (upcoming.length === 0) {
    push(plan ? '_Keine geplanten Einheiten._' : '_Kein aktiver Trainingsplan._')
  } else {
    for (const s of upcoming) {
      const note = s.coachingNote?.trim() ? ` – ${oneLine(s.coachingNote)}` : ''
      push(`- #${s.id} · ${short(s.date)} ${dayName(s.date)} · ${s.title ?? TYPE_DE[s.type] ?? s.type} (${TYPE_DE[s.type] ?? s.type}) · ${targetText(s)}${note}`)
    }
  }
  push('')

  push('## Antwort-Format für Änderungen', COACH_CHANGES_FORMAT, '')
  push(
    '## So nutzt du den Bericht',
    'Füge den ganzen Bericht in claude.ai ein und ergänze eine Frage, zum Beispiel:',
    '- „Bewerte meine Trainingswoche anhand des Berichts. Was lief gut, was sollte ich ändern?“',
    '- „Passe die nächste Woche an meine Verfassung an. Antworte im Änderungs-Format.“',
    '- „Bin ich mit meiner Belastung auf Kurs für mein Ziel? Beachte meine Verletzungsnotizen.“',
    '',
  )
  return L.join('\n')
}
