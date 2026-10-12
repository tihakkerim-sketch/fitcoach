/**
 * Datums-Logik für Pläne. Von Main-Prozess und Renderer genutzt (kein electron-Import).
 * Alle Tage sind lokale 'YYYY-MM-DD'-Strings; geparst wird mit T12:00:00,
 * damit Sommerzeit-Wechsel den Tag nie verschieben.
 */
import { addDays, format, parseISO } from 'date-fns'

const parse = (date: string): Date => parseISO(`${date}T12:00:00`)
const fmt = (d: Date): string => format(d, 'yyyy-MM-dd')

/**
 * Heutiges lokales Datum. Mit `dayStartHour` > 0 beginnt der „App-Tag" erst zu dieser Stunde
 * (01:30 Uhr mit 4 → noch der Vortag).
 */
export function todayLocal(now: Date = new Date(), dayStartHour = 0): string {
  return fmt(new Date(now.getTime() - dayStartHour * 3_600_000))
}

export function addDaysStr(date: string, n: number): string {
  return fmt(addDays(parse(date), n))
}

export function isMonday(date: string): boolean {
  return parse(date).getDay() === 1
}

/** Montag der Woche, in der `date` liegt (Sonntag gehört zur Woche davor). */
export function mondayOf(date: string): string {
  const dow = parse(date).getDay() // 0 = So
  return addDaysStr(date, -((dow + 6) % 7))
}

/** Datum einer Einheit: Start + Woche·7 + (Wochentag − 1); 1 = Mo … 7 = So. */
export function sessionDate(startDate: string, weekIndex: number, dayOfWeek: number): string {
  return addDaysStr(startDate, weekIndex * 7 + (dayOfWeek - 1))
}

export function weekRange(startDate: string, weekIndex: number): { from: string; to: string } {
  return { from: sessionDate(startDate, weekIndex, 1), to: sessionDate(startDate, weekIndex, 7) }
}

/** Sonntag der letzten Woche. */
export function planEndDate(startDate: string, weekCount: number): string {
  return sessionDate(startDate, weekCount - 1, 7)
}

/** Index der Woche, in der `today` liegt (kann < 0 oder ≥ weekCount sein). */
export function currentWeekIndex(startDate: string, today: string): number {
  const days = Math.round((parse(today).getTime() - parse(startDate).getTime()) / 86_400_000)
  return Math.floor(days / 7)
}

export function planState(startDate: string, weekCount: number, today: string): 'before' | 'running' | 'finished' {
  if (today < startDate) return 'before'
  if (today > planEndDate(startDate, weekCount)) return 'finished'
  return 'running'
}

/** „Verpasst" ist kein Status: geplant, kein Ruhetag, Datum liegt vor heute. */
export function isMissed(s: { status: string; type: string }, date: string, today: string): boolean {
  return s.status === 'planned' && s.type !== 'rest' && date < today
}

/** 330 → "5:30" */
export function formatPace(sec: number): string {
  const total = Math.round(sec)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** "5:30" → 330; ungültig (Sekunden > 59, kein Format) → null */
export function parsePace(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const min = Number(m[1])
  const sec = Number(m[2])
  if (sec > 59) return null
  return min * 60 + sec
}

/** "5:30-5:50" (auch "–"), einzelner Wert → fast = slow; vertauschte Werte werden sortiert. */
export function parsePaceRange(s: string): { fast: number; slow: number } | null {
  const parts = s.split(/\s*[-–]\s*/)
  if (parts.length < 1 || parts.length > 2) return null
  const vals = parts.map(parsePace)
  if (vals.some(v => v === null)) return null
  const [a, b] = vals as number[]
  const other = b ?? a
  return { fast: Math.min(a, other), slow: Math.max(a, other) }
}
