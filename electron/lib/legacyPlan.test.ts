import { describe, it, expect } from 'vitest'
import { convertLegacyPlans, type LegacySession } from './legacyPlan'

const session = (over: Partial<LegacySession> & { id: number; weekId: number }): LegacySession => ({
  dayOfWeek: 1, type: 'running', targetDurationMin: null, targetHrZone: null, intensityLabel: null,
  coachingNote: null, status: 'planned', linkedActivityId: null, completedAt: null, completionNote: null,
  ...over,
})

const plan = (over: Partial<{ id: number; createdAt: number; isActive: number }> = {}) => ({
  id: 1, name: 'Marathon', goalEvent: 'Marathon', goalDate: '2026-10-04', isActive: 1,
  createdAt: new Date('2026-05-20T10:00:00').getTime(), ...over,
})

describe('convertLegacyPlans', () => {
  // 3 Phasen à 1 Woche
  const phases = [
    { id: 10, planId: 1, name: 'Grundlage', orderIndex: 0, durationWeeks: 1 },
    { id: 11, planId: 1, name: 'Aufbau', orderIndex: 1, durationWeeks: 1 },
    { id: 12, planId: 1, name: 'Spitze', orderIndex: 2, durationWeeks: 1 },
  ]
  const weeks = [
    { id: 100, phaseId: 10, weekNumber: 1, notes: 'Start' },
    { id: 101, phaseId: 11, weekNumber: 1, notes: null },
    { id: 102, phaseId: 12, weekNumber: 1, notes: null },
  ]

  it('leitet das Startdatum aus verknüpften Läufen ab (Mehrheit gewinnt, Ausreißer ignoriert)', () => {
    const sessions = [
      session({ id: 1, weekId: 100, dayOfWeek: 2, status: 'completed', linkedActivityId: 1 }),
      session({ id: 2, weekId: 101, dayOfWeek: 4, status: 'completed', linkedActivityId: 2 }),
      session({ id: 3, weekId: 102, dayOfWeek: 6, status: 'completed', linkedActivityId: 3 }),
    ]
    const activities = [
      { id: 1, date: '2026-05-19' }, // Woche 0, Di -> Start 18.05.
      { id: 2, date: '2026-05-28' }, // Woche 1, Do -> Start 18.05.
      { id: 3, date: '2026-06-13' }, // Woche 2, Sa -> Start 25.05. (Ausreißer)
    ]
    const r = convertLegacyPlans({ plans: [plan()], phases, weeks, sessions, activities })
    expect(r.plans).toHaveLength(1)
    expect(r.plans[0].startDate).toBe('2026-05-18')
    expect(r.plans[0].isActive).toBe(0)
  })

  it('bei Gleichstand gewinnt das früheste Datum', () => {
    const sessions = [
      session({ id: 1, weekId: 100, dayOfWeek: 1, linkedActivityId: 1 }),
      session({ id: 2, weekId: 101, dayOfWeek: 1, linkedActivityId: 2 }),
    ]
    const activities = [{ id: 1, date: '2026-06-01' }, { id: 2, date: '2026-06-01' }] // Start 01.06. bzw. 25.05.
    const r = convertLegacyPlans({ plans: [plan()], phases, weeks, sessions, activities })
    expect(r.plans[0].startDate).toBe('2026-05-25')
  })

  it('ohne Verknüpfung: Montag der Woche von createdAt', () => {
    const r = convertLegacyPlans({ plans: [plan()], phases, weeks, sessions: [session({ id: 1, weekId: 100 })], activities: [] })
    expect(r.plans[0].startDate).toBe('2026-05-18')
  })

  it('Phase mit 2 Wochen: weekIndex fortlaufend, phase gesetzt, notes bleibt', () => {
    const r = convertLegacyPlans({
      plans: [plan()],
      phases: [{ id: 10, planId: 1, name: 'Grundlage', orderIndex: 0, durationWeeks: 2 }, { id: 11, planId: 1, name: 'Aufbau', orderIndex: 1, durationWeeks: 1 }],
      weeks: [
        { id: 102, phaseId: 11, weekNumber: 1, notes: null },
        { id: 101, phaseId: 10, weekNumber: 2, notes: 'zweite' },
        { id: 100, phaseId: 10, weekNumber: 1, notes: 'erste' },
      ],
      sessions: [], activities: [],
    })
    expect(r.weeks.map(w => [w.weekIndex, w.phase, w.notes])).toEqual([
      [0, 'Grundlage', 'erste'], [1, 'Grundlage', 'zweite'], [2, 'Aufbau', null],
    ])
    expect(r.weeks.map(w => w.id)).toEqual([1, 2, 3])
    expect(new Set(r.weeks.map(w => w.planId))).toEqual(new Set([1]))
  })

  it('Felder 1:1, intensityLabel wird title, Session-IDs bleiben', () => {
    const r = convertLegacyPlans({
      plans: [plan()], phases, weeks,
      sessions: [session({ id: 77, weekId: 101, dayOfWeek: 3, intensityLabel: 'Easy run', targetDurationMin: 45, targetHrZone: 2, coachingNote: 'ruhig', status: 'skipped', completionNote: 'krank' })],
      activities: [],
    })
    expect(r.sessions).toHaveLength(1)
    expect(r.sessions[0]).toMatchObject({
      id: 77, weekId: 2, dayOfWeek: 3, type: 'running', title: 'Easy run', targetDurationMin: 45, targetHrZone: 2,
      coachingNote: 'ruhig', status: 'skipped', completionNote: 'krank', steps: null,
      targetDistanceKm: null, targetPaceFastSec: null, targetPaceSlowSec: null, linkedActivityId: null, matchSource: null,
    })
  })

  it('Verknüpfung bleibt (manual), fehlende Aktivität wird entfernt, Status bleibt', () => {
    const r = convertLegacyPlans({
      plans: [plan()], phases, weeks,
      sessions: [
        session({ id: 1, weekId: 100, status: 'completed', linkedActivityId: 5, completedAt: 123 }),
        session({ id: 2, weekId: 100, dayOfWeek: 2, status: 'completed', linkedActivityId: 999 }),
      ],
      activities: [{ id: 5, date: '2026-05-18' }],
    })
    const [a, b] = r.sessions
    expect(a).toMatchObject({ linkedActivityId: 5, matchSource: 'manual', completedAt: 123 })
    expect(b).toMatchObject({ linkedActivityId: null, matchSource: null, status: 'completed' })
  })

  it('klemmt dayOfWeek auf 1-7 und alle Pläne werden inaktiv', () => {
    const r = convertLegacyPlans({
      plans: [plan({ isActive: 1 }), plan({ id: 2, isActive: 1 })],
      phases: [...phases, { id: 20, planId: 2, name: 'X', orderIndex: 0, durationWeeks: 1 }],
      weeks: [...weeks, { id: 200, phaseId: 20, weekNumber: 1, notes: null }],
      sessions: [session({ id: 1, weekId: 100, dayOfWeek: 0 }), session({ id: 2, weekId: 100, dayOfWeek: 9 }), session({ id: 3, weekId: 200 })],
      activities: [],
    })
    expect(r.plans.map(p => p.isActive)).toEqual([0, 0])
    expect(r.sessions.map(s => s.dayOfWeek)).toEqual([1, 7, 1])
    // Week-IDs laufen planübergreifend fortlaufend
    expect(r.weeks.map(w => [w.id, w.planId])).toEqual([[1, 1], [2, 1], [3, 1], [4, 2]])
    expect(r.sessions[2].weekId).toBe(4)
  })

  it('ignoriert Wochen und Sessions ohne Eltern', () => {
    const r = convertLegacyPlans({
      plans: [plan()], phases,
      weeks: [...weeks, { id: 900, phaseId: 777, weekNumber: 1, notes: null }],
      sessions: [session({ id: 1, weekId: 100 }), session({ id: 2, weekId: 12345 })],
      activities: [],
    })
    expect(r.weeks).toHaveLength(3)
    expect(r.sessions.map(s => s.id)).toEqual([1])
  })
})
