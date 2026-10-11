/**
 * Umwandlung alter Phasen-Pläne (plan_phases → plan_weeks → plan_sessions) ins neue Modell
 * (Plan mit Startdatum, Wochen mit Index, Einheiten). Reine Funktion, benutzt von
 * Migration v3 und vom Backup-Import (v1–v4). Free of `electron` imports.
 */
import { format } from 'date-fns'
import { addDaysStr, mondayOf } from '../../src/shared/planCalendar'

export interface LegacyPlan { id: number; name: string; goalEvent: string | null; goalDate: string | null; isActive: number; createdAt: number }
export interface LegacyPhase { id: number; planId: number; name: string; orderIndex: number; durationWeeks: number }
export interface LegacyWeek { id: number; phaseId: number; weekNumber: number; notes: string | null }
export interface LegacySession {
  id: number; weekId: number; dayOfWeek: number; type: string
  targetDurationMin: number | null; targetHrZone: number | null; intensityLabel: string | null
  coachingNote: string | null; status: string; linkedActivityId: number | null
  completedAt: number | null; completionNote: string | null
}

export interface NewPlanRowDb { id: number; name: string; goalEvent: string | null; goalDate: string | null; startDate: string; isActive: number; createdAt: number }
export interface NewWeekRowDb { id: number; planId: number; weekIndex: number; phase: string | null; notes: string | null }
export interface NewSessionRowDb {
  id: number; weekId: number; dayOfWeek: number; type: string; title: string | null
  targetDistanceKm: null; targetDurationMin: number | null
  targetPaceFastSec: null; targetPaceSlowSec: null; targetHrZone: number | null
  steps: null; coachingNote: string | null; status: string
  linkedActivityId: number | null; matchSource: 'manual' | null
  completedAt: number | null; completionNote: string | null
}

const clampDow = (n: number): number => Math.min(7, Math.max(1, Math.round(Number(n)) || 1))

/** Häufigster Wert; bei Gleichstand der früheste (Strings im Format YYYY-MM-DD). */
function mostCommonEarliest(values: string[]): string | null {
  if (values.length === 0) return null
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]
}

export function convertLegacyPlans(input: {
  plans: LegacyPlan[]; phases: LegacyPhase[]; weeks: LegacyWeek[]; sessions: LegacySession[]
  activities: { id: number; date: string }[]
}): { plans: NewPlanRowDb[]; weeks: NewWeekRowDb[]; sessions: NewSessionRowDb[] } {
  const activityDate = new Map(input.activities.map(a => [a.id, a.date]))
  const outPlans: NewPlanRowDb[] = []
  const outWeeks: NewWeekRowDb[] = []
  const outSessions: NewSessionRowDb[] = []

  // Alte Wochen-ID → neue Woche (für die Sessions)
  const weekMap = new Map<number, { newId: number; planIndex: number; weekIndex: number }>()
  let nextWeekId = 1

  input.plans.forEach((plan, planIdx) => {
    const planPhases = input.phases.filter(p => p.planId === plan.id).sort((a, b) => a.orderIndex - b.orderIndex)
    let weekIndex = 0
    for (const phase of planPhases) {
      const phaseWeeks = input.weeks.filter(w => w.phaseId === phase.id).sort((a, b) => a.weekNumber - b.weekNumber)
      for (const w of phaseWeeks) {
        const newId = nextWeekId++
        outWeeks.push({ id: newId, planId: plan.id, weekIndex, phase: phase.name, notes: w.notes })
        weekMap.set(w.id, { newId, planIndex: planIdx, weekIndex })
        weekIndex++
      }
    }
    outPlans.push({
      id: plan.id, name: plan.name, goalEvent: plan.goalEvent, goalDate: plan.goalDate,
      startDate: '', isActive: 0, createdAt: plan.createdAt,
    })
  })

  const votes: string[][] = input.plans.map(() => [])
  for (const s of input.sessions) {
    const w = weekMap.get(s.weekId)
    if (!w) continue
    const dow = clampDow(s.dayOfWeek)
    const date = s.linkedActivityId !== null ? activityDate.get(s.linkedActivityId) : undefined
    if (date !== undefined) votes[w.planIndex].push(mondayOf(addDaysStr(date, -(w.weekIndex * 7 + dow - 1))))
    outSessions.push({
      id: s.id, weekId: w.newId, dayOfWeek: dow, type: s.type, title: s.intensityLabel,
      targetDistanceKm: null, targetDurationMin: s.targetDurationMin,
      targetPaceFastSec: null, targetPaceSlowSec: null, targetHrZone: s.targetHrZone,
      steps: null, coachingNote: s.coachingNote, status: s.status,
      linkedActivityId: date !== undefined ? s.linkedActivityId : null,
      matchSource: date !== undefined ? 'manual' : null,
      completedAt: s.completedAt, completionNote: s.completionNote,
    })
  }

  outPlans.forEach((p, i) => {
    p.startDate = mostCommonEarliest(votes[i]) ?? mondayOf(format(new Date(p.createdAt), 'yyyy-MM-dd'))
  })

  return { plans: outPlans, weeks: outWeeks, sessions: outSessions }
}
