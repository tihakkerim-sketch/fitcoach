import { describe, it, expect, beforeEach } from 'vitest'
import { activities, activitySplits, dailyCheckins, recoveryLogs, userProfile } from '../../db/schema'
import { makeTestDb, type TestDb } from './testDb'
import { createPlan } from './planWrite'
import { getPlanDetail } from './planRead'
import { buildCoachReport } from './coachExport'

const TODAY = '2026-10-14' // Mittwoch
const RANGE = { dateFrom: '2026-10-05', dateTo: '2026-10-14' }
let db: TestDb

beforeEach(async () => { db = await makeTestDb() })

describe('buildCoachReport', () => {
  it('Befinden der letzten 14 Tage steht im Recovery-Abschnitt', () => {
    db.insert(recoveryLogs).values([
      { date: '2026-10-12', feeling: 4, createdAt: 1, updatedAt: 1 },
      { date: '2026-10-13', feeling: 3, createdAt: 1, updatedAt: 1 },
      { date: '2026-09-01', feeling: 1, createdAt: 1, updatedAt: 1 }, // zu alt
      { date: '2026-10-11', createdAt: 1, updatedAt: 1 },             // ohne Befinden
    ]).run()
    const md = buildCoachReport(db, TODAY, RANGE)
    expect(md).toContain('- Befinden (14 Tage, 1–5): 12.10. 4 · 13.10. 3')
    expect(md).not.toContain('01.09. 1')
  })

  it('ohne Befinden keine Zeile', () => {
    expect(buildCoachReport(db, TODAY, RANGE)).not.toContain('Befinden')
  })

  it('leere DB: alle Abschnitte ohne Absturz', () => {
    const md = buildCoachReport(db, TODAY, RANGE)
    for (const h of ['# FitCoach – Coach-Bericht', '## Profil', '## Status', '## Diese Woche', '## Letzte 4 Wochen',
      '## Aktivitäten im Zeitraum', '## Kommende 14 Tage', '## Antwort-Format für Änderungen', '## So nutzt du den Bericht']) {
      expect(md).toContain(h)
    }
    expect(md).toContain('fitcoachChanges')
    expect(md).not.toContain('undefined')
    expect(md).not.toContain('NaN')
  })

  it('gefüllte DB: Profil, Zonen, Status, Plan mit #id, Splits, Notizen', () => {
    db.insert(userProfile).values({
      id: 1, name: 'Adel', age: 30, maxHr: 190, restingHr: 50, goalEvent: 'Halbmarathon',
      goalFinishTime: '1:50', trainingDaysPerWeek: 4, injuryNotes: 'Wade links',
    }).run()
    const plan = createPlan(db, {
      name: 'P', startDate: '2026-10-05',
      weeks: [
        { sessions: [{ dayOfWeek: 2, type: 'running', title: 'Easy', targetDistanceKm: 8, targetPaceFastSec: 360, targetPaceSlowSec: 380 }] },
        { sessions: [{ dayOfWeek: 4, type: 'running', title: 'Tempo', targetDistanceKm: 10, coachingNote: 'locker' }] },
      ],
    })
    const sessions = getPlanDetail(db, plan.id)!.weeks.flatMap(w => w.sessions)
    const upcomingId = sessions[1].id
    const [run] = db.insert(activities).values({
      type: 'running', date: '2026-10-06', createdAt: 1, source: 'manual', distanceKm: 8, durationMin: 50,
      avgHr: 150, maxHr: 175, perceivedEffort: 5, elevationGainM: 40, notes: 'Wade ok',
    }).returning().all()
    db.insert(activities).values({
      type: 'running', date: '2026-10-12', createdAt: 1, source: 'manual', distanceKm: 6, durationMin: 36,
    }).run()
    db.insert(activitySplits).values([
      { activityId: run.id, splitIndex: 1, distanceKm: 1, durationSec: 341, paceSecPerKm: 341 },
      { activityId: run.id, splitIndex: 2, distanceKm: 1, durationSec: 338, paceSecPerKm: 338 },
    ]).run()
    db.insert(recoveryLogs).values({
      date: TODAY, hrvRmssd: 60, restingHr: 50, sleepHours: 7.5, note: 'müde Beine', createdAt: 1, updatedAt: 1,
    }).run()
    db.insert(dailyCheckins).values({ date: '2026-10-13', eveningNote: 'Wade zwickt', createdAt: 1, updatedAt: 1 }).run()

    const md = buildCoachReport(db, TODAY, RANGE)
    if (process.env.DUMP_REPORT) console.log(md)
    expect(md).toContain('Wade links')
    expect(md).toContain('berechnet nach Karvonen')
    expect(md).toContain('Fitness (CTL)')
    expect(md).toContain('Prognose Halbmarathon')
    expect(md).toContain('Zielzeit 1:50:00')
    expect(md).toContain(`#${upcomingId} · 15.10. Do · Tempo`)
    expect(md).toContain('Splits: 5:41, 5:38')
    expect(md).toContain('Wade ok')
    expect(md).toContain('müde Beine')
    expect(md).toContain('Wade zwickt')
    expect(md).toContain('HRV (ms)')
    expect(md).toContain('Ungeplante Läufe')
    expect(md).toContain('| 15.10. | Do | Tempo | 10 km | geplant | — |')
  })
})
