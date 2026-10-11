/** Anzeige-Helfer für Plan-Einheiten (Texte auf Deutsch). */
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Activity, Dumbbell, Moon, TrendingUp, Zap, type LucideIcon } from 'lucide-react'
import type { DeviationItem } from '@/shared/deviation'
import { isMissed, formatPace, mondayOf, addDaysStr } from '@/shared/planCalendar'
import type { PlanBlock, PlanStep, SessionRow, SessionType } from '@/types/ipc'

export const TYPE_LABEL: Record<SessionType, string> = {
  running: 'Lauf', cycling: 'Rad', strength: 'Kraft', rest: 'Ruhetag', custom: 'Sonstiges',
}

export const DOW_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const DOW_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

export type StatusTone = 'muted' | 'success' | 'warning' | 'danger' | 'primary'
export type StatusLabel = 'geplant' | 'erledigt' | 'übersprungen' | 'verpasst' | 'heute'

/** 8.5 → "8,5" */
export function num(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',')
}

function paceText(fast?: number | null, slow?: number | null): string | null {
  const f = fast ?? slow
  const s = slow ?? fast
  if (f == null || s == null) return null
  return f === s ? `${formatPace(f)}/km` : `${formatPace(f)}–${formatPace(s)}/km`
}

type Target = Pick<SessionRow,
  'targetDistanceKm' | 'targetDurationMin' | 'targetPaceFastSec' | 'targetPaceSlowSec' | 'targetHrZone'>

/** z. B. "8 km · 6:00–6:20/km · Z2" */
export function sessionTargetText(s: Target): string {
  const parts: string[] = []
  if (s.targetDistanceKm) parts.push(`${num(s.targetDistanceKm)} km`)
  if (s.targetDurationMin) parts.push(`${num(s.targetDurationMin)} min`)
  const pace = paceText(s.targetPaceFastSec, s.targetPaceSlowSec)
  if (pace) parts.push(pace)
  if (s.targetHrZone) parts.push(`Z${s.targetHrZone}`)
  return parts.join(' · ')
}

function durationText(sec: number): string {
  if (sec < 60) return `${sec} s`
  if (sec % 60 === 0) return `${sec / 60} min`
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min`
}

function amountText(st: PlanStep): string {
  if (st.distanceM) {
    return st.distanceM >= 1000 && st.distanceM % 100 === 0
      ? `${num(st.distanceM / 1000)} km`
      : `${num(st.distanceM)} m`
  }
  if (st.durationSec) return durationText(st.durationSec)
  return ''
}

function stepText(st: PlanStep): string {
  const amount = amountText(st)
  const pace = paceText(st.paceFastSec, st.paceSlowSec)
  let base: string
  switch (st.kind) {
    case 'warmup': base = ['Aufwärmen', amount].filter(Boolean).join(' '); break
    case 'cooldown': base = ['Auslaufen', amount].filter(Boolean).join(' '); break
    case 'recovery': base = [amount, 'Trabpause'].filter(Boolean).join(' '); break
    default: base = amount || 'Belastung'
  }
  return pace ? `${base} @ ${pace}` : base
}

/** Eine Zeile je Block, z. B. "6 × (800 m @ 4:50–4:55/km, 400 m Trabpause)". */
export function stepsText(steps: PlanBlock[]): string[] {
  return steps.map(b => 'repeat' in b
    ? `${b.repeat} × (${b.steps.map(stepText).join(', ')})`
    : stepText(b))
}

export function statusLabel(
  s: Pick<SessionRow, 'status' | 'type' | 'date'>,
  today: string,
): { label: StatusLabel; tone: StatusTone } {
  if (s.status === 'completed') return { label: 'erledigt', tone: 'success' }
  if (s.status === 'skipped') return { label: 'übersprungen', tone: 'warning' }
  if (isMissed(s, s.date, today)) return { label: 'verpasst', tone: 'danger' }
  if (s.type !== 'rest' && s.date === today) return { label: 'heute', tone: 'primary' }
  return { label: 'geplant', tone: 'muted' }
}

/** Tailwind-Klassen je Ton. */
export const TONE_CLASS: Record<StatusTone, { dot: string; text: string; card: string }> = {
  muted:   { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground', card: 'bg-card' },
  success: { dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400', card: 'bg-green-500/10 border-green-500/30' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', card: 'bg-amber-500/10 border-amber-500/30' },
  danger:  { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', card: 'bg-red-500/10 border-red-500/30' },
  primary: { dot: 'bg-primary', text: 'text-primary', card: 'bg-card' },
}

export const TYPE_ICON: Record<SessionType, LucideIcon> = {
  running: TrendingUp, cycling: Zap, strength: Dumbbell, rest: Moon, custom: Activity,
}

/** 'YYYY-MM-DD' → z. B. "12.10.2026" (pattern: date-fns, Standard dd.MM.yyyy). */
export function fmtDate(date: string, pattern = 'dd.MM.yyyy'): string {
  return format(parseISO(`${date}T12:00:00`), pattern, { locale: de })
}

/** Nächster Montag nach `today` (Vorschlag für das Startdatum). */
export function nextMonday(today: string): string {
  return addDaysStr(mondayOf(today), 7)
}

const signed = (pct: number) => (pct > 0 ? `+${pct}` : pct < 0 ? `−${Math.abs(pct)}` : '±0')

/** z. B. "Distanz 16 km → 11 km (−31 %)" */
export function deviationLine(d: DeviationItem): string {
  const p = `(${signed(d.pct)} %)`
  switch (d.field) {
    case 'distance': return `Distanz ${num(d.planned)} km → ${num(d.actual)} km ${p}`
    case 'duration': return `Dauer ${num(d.planned)} min → ${num(d.actual)} min ${p}`
    default: return `Pace ${formatPace(d.planned)}/km → ${formatPace(d.actual)}/km ${p}`
  }
}
