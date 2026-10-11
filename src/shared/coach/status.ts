/** Fasst alle Coach-Berechnungen zu einem Status zusammen (ohne DB). */
import { addDaysStr } from '../planCalendar'
import { formLevel, loadSeries } from './load'
import { goalDistance, parseGoalTime, predictRace } from './prognosis'
import { acwrWarning, rampInfo } from './ramp'
import { recoveryTrend, type RecoveryLogLite } from './recoveryTrend'
import type { CoachActivity, CoachStatus, ZoneDef } from './types'
import { effectiveZones, resolveHrBasics } from './zones'

export interface CoachStatusInput {
  today: string
  activities: CoachActivity[]
  savedZones: ZoneDef[]
  profile: {
    maxHr?: number | null
    restingHr?: number | null
    goalEvent?: string | null
    goalFinishTime?: string | null
  } | null
  recoveryLogs: RecoveryLogLite[]
  plannedNext7Km: number | null
  goalEventOverride?: string | null
  /** Höchster gemessener Max-Puls aus Aktivitäten (Fallback, wenn kein Profil-Max). */
  observedMaxHr?: number | null
}

export function buildCoachStatus(input: CoachStatusInput): CoachStatus {
  const { today, profile } = input
  const from30 = addDaysStr(today, -29)
  const recoveryRestHrs = input.recoveryLogs
    .filter(l => l.date >= from30 && l.date <= today && typeof l.restingHr === 'number' && l.restingHr > 0)
    .map(l => l.restingHr as number)
  const hr = resolveHrBasics({
    profileMaxHr: profile?.maxHr,
    profileRestHr: profile?.restingHr,
    observedMaxHr: input.observedMaxHr,
    recoveryRestHrs,
  })
  const { zones, source } = effectiveZones(input.savedZones, hr)
  const series = loadSeries(input.activities, hr, addDaysStr(today, -179), today).slice(-90)
  const current = series.length ? series[series.length - 1] : null

  const ramp = rampInfo(input.activities, today, input.plannedNext7Km)
  if (current) {
    const w = acwrWarning(current.ctl, current.atl)
    if (w) ramp.warnings.push(w)
  }

  const target = goalDistance(input.goalEventOverride ?? profile?.goalEvent)
  const prognosis = predictRace(input.activities, today, target, parseGoalTime(profile?.goalFinishTime))

  return {
    today,
    hr,
    zones,
    zonesSource: source,
    current,
    form: current ? formLevel(current.tsb) : null,
    series,
    ramp,
    prognosis,
    recovery: recoveryTrend(input.recoveryLogs, today),
  }
}
