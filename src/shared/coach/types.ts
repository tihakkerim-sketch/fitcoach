/**
 * Gemeinsame Typen der Coach-Logik (Main + Renderer). Kein `@/`-Alias, keine Node-/Electron-Importe.
 */

export interface ZoneDef {
  zoneNumber: number // 1–5
  minHr: number
  maxHr: number
  label: string
}

/** Puls-Grundwerte, aus denen Zonen und Belastung berechnet werden. */
export interface HrBasics {
  maxHr: number
  restHr: number
  maxSource: 'profile' | 'observed'
  restSource: 'profile' | 'recovery' | 'default'
}

/** Minimale Aktivitätsdaten für Belastung, Steigerung und Prognose. */
export interface CoachActivity {
  date: string // YYYY-MM-DD
  type: string // running | cycling | strength | custom | sleep
  durationMin: number | null
  distanceKm: number | null
  avgHr: number | null
  perceivedEffort: number | null
}

export interface LoadPoint {
  date: string
  load: number // TRIMP des Tages
  ctl: number  // Fitness
  atl: number  // Ermüdung
  tsb: number  // Form = CTL − ATL des Vortags
}

export type FormLevel = 'fresh' | 'neutral' | 'building' | 'overload'

export type WarningLevel = 'info' | 'warn'

export interface RampWarning {
  kind: 'weeklyKm' | 'longRun' | 'plannedWeek' | 'acwr'
  level: WarningLevel
  text: string // fertiger deutscher Satz
  percent: number // Steigerung in %, z. B. 25
}

export interface RampInfo {
  last7Km: number
  avgWeekKmPrev28: number
  longestLast7Km: number
  longestPrev28Km: number
  plannedNext7Km: number | null
  warnings: RampWarning[]
}

export type PrognosisStatus = 'onTrack' | 'close' | 'offTrack' | 'noGoal'

export interface Prognosis {
  targetKm: number
  targetLabel: string // "Marathon"
  predictedSec: number
  basedOn: { date: string; distanceKm: number; durationSec: number }
  goalSec: number | null
  status: PrognosisStatus
  requiredPaceSec: number | null // s/km für die Zielzeit
  predictedPaceSec: number
}

export interface RecoveryTrend {
  hrvToday: number | null
  hrv7: number | null
  hrv30: number | null
  rhr7: number | null
  rhr30: number | null
  sleep7: number | null // h
  sleep30: number | null
  /** HRV heute relativ zum 30-Tage-Schnitt in % (−12 = 12 % unter Schnitt) */
  hrvDeltaPct: number | null
}

export interface CoachStatus {
  today: string
  hr: HrBasics | null
  zones: ZoneDef[]
  zonesSource: 'saved' | 'computed' | 'none'
  current: LoadPoint | null
  form: FormLevel | null
  series: LoadPoint[] // letzte 90 Tage (inkl. heute)
  ramp: RampInfo
  prognosis: Prognosis | null
  recovery: RecoveryTrend
}
