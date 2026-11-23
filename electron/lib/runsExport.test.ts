import { describe, it, expect, beforeEach } from 'vitest'
import { activities, activitySplits, planSessions, shoes, userProfile } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { makeTestDb, type TestDb } from './testDb'
import { createPlan } from './planWrite'
import { getPlanDetail } from './planRead'
import { buildRunsExport } from './runsExport'

const TODAY = '2026-11-23'
const RANGE = { dateFrom: '2026-11-10', dateTo: '2026-11-23' }
let db: TestDb

beforeEach(async () => { db = await makeTestDb() })

describe('buildRunsExport', () => {
  it('leerer Zeitraum: Hinweis, kein Läufe-Abschnitt, Auswertungs-Bitte bleibt', () => {
    const md = buildRunsExport(db, RANGE, TODAY)
    expect(md).toContain('# Läufe zur Auswertung – 2026-11-10 bis 2026-11-23')
    expect(md).toContain('Keine Läufe im Zeitraum.')
    expect(md).not.toContain('## Läufe')
    expect(md).toContain('## Bitte auswerten')
    expect(md).not.toContain('undefined')
    expect(md).not.toContain('NaN')
  })

  it('zwei Läufe, Rad fehlt; Summen und Wochen-Tabelle', () => {
    db.insert(activities).values([
      { type: 'running', date: '2026-11-11', createdAt: 1, source: 'manual', distanceKm: 10, durationMin: 60, avgHr: 150 },
      { type: 'running', date: '2026-11-17', createdAt: 1, source: 'manual', distanceKm: 14.02, durationMin: 84, avgHr: 141 },
      { type: 'cycling', date: '2026-11-12', createdAt: 1, source: 'manual', distanceKm: 33.33, durationMin: 80 },
      { type: 'running', date: '2026-11-01', createdAt: 1, source: 'manual', distanceKm: 5, durationMin: 30 }, // außerhalb
    ] as never).run()
    const md = buildRunsExport(db, RANGE, TODAY)
    if (process.env.DUMP_REPORT) console.log(md)
    expect(md).toContain('Läufe: 2 · Distanz: 24.0 km · Zeit: 2h 24m')
    expect(md).toContain('| 2026-11-09 | 1 | 10.0 km | 1h 00m | 10.0 km |')
    expect(md).toContain('| 2026-11-16 | 1 | 14.0 km | 1h 24m | 14.0 km |')
    expect(md).toContain('14.02 km')
    expect(md).not.toContain('33.33')
    expect(md).not.toContain('5.00 km')
    expect(md).toContain('ungeplant')
    // Kadenz/Höhenmeter fehlen → Strich
    expect(md).toContain('| – | – |')
  })

  it('Splits-Tabelle, Zonenzeit, Beschwerden, Notiz, Schuh', () => {
    const shoe = db.insert(shoes).values({ name: 'Pegasus', createdAt: 1 }).returning().get()
    const run = db.insert(activities).values({
      type: 'running', date: '2026-11-17', createdAt: 1, source: 'manual', distanceKm: 2.5, durationMin: 15,
      avgHr: 150, maxHr: 170, elevationGainM: 20, elevationLossM: 18, avgCadence: 172, perceivedEffort: 4,
      pain: 1, notes: 'Wade\nzwickt', shoeId: shoe.id,
      hrZoneDistribution: JSON.stringify({ z1: 10, z2: 70, z3: 20, z4: 0, z5: 0 }),
    } as never).returning().get()
    db.insert(activitySplits).values([
      { activityId: run.id, splitIndex: 1, distanceKm: 1, durationSec: 360, paceSecPerKm: 360, avgHr: 145, elevationGainM: 8, elevationLossM: 5 },
      { activityId: run.id, splitIndex: 3, distanceKm: 0.5, durationSec: 170 },
    ]).run()
    const md = buildRunsExport(db, RANGE, TODAY)
    expect(md).toContain('| 1 | 6:00/km | 145 | +8/−5 |')
    expect(md).toContain('| 3 (0.50 km) | 5:40/km | – | – |')
    expect(md).toContain('Puls-Zonen-Zeit: Z1 10 % · Z2 70 % · Z3 20 % · Z4 0 % · Z5 0 %')
    expect(md).toContain('172 spm | 4/10')
    expect(md).toContain('+20/−18 m')
    expect(md).toContain('- Beschwerden: ja')
    expect(md).toContain('- Notiz: „Wade zwickt“')
    expect(md).toContain('- Schuh: Pegasus')
  })

  it('Plan-Verknüpfung steht in der Überschrift; Kontext aus Profil', () => {
    db.insert(userProfile).values({
      id: 1, maxHr: 190, restingHr: 52, goalEvent: 'Halbmarathon', goalFinishTime: '1:50', injuryNotes: 'Wade links',
    }).run()
    const plan = createPlan(db, {
      name: 'P', startDate: '2026-11-16',
      weeks: [{ sessions: [{ dayOfWeek: 2, type: 'running', title: 'Langer Lauf', targetDistanceKm: 14, targetHrZone: 2 }] }],
    })
    const sessionId = getPlanDetail(db, plan.id)!.weeks[0].sessions[0].id
    const run = db.insert(activities).values({
      type: 'running', date: '2026-11-17', createdAt: 1, source: 'manual', distanceKm: 14.02, durationMin: 84,
    } as never).returning().get()
    db.update(planSessions).set({ linkedActivityId: run.id, status: 'completed' }).where(eq(planSessions.id, sessionId)).run()
    const md = buildRunsExport(db, RANGE, TODAY)
    expect(md).toContain('### Di 17.11.2026 · 14.02 km · Plan: „Langer Lauf“ (Soll: 14 km · Z2)')
    expect(md).toContain('- Plan-Status: erledigt · Langer Lauf am 17.11.')
    expect(md).toContain('- Max-Puls 190 bpm, Ruhepuls 52 bpm')
    expect(md).toContain('- Puls-Zonen: Z1')
    expect(md).toContain('- Ziel: Halbmarathon')
    expect(md).toContain('Zielzeit 1:50')
    expect(md).toContain('Verletzungen/Gesundheit: Wade links')
  })

  it('Fehler bei vertauschtem Datum und zu langem Zeitraum', () => {
    expect(() => buildRunsExport(db, { dateFrom: '2026-11-23', dateTo: '2026-11-10' }, TODAY))
      .toThrow('Startdatum liegt nach dem Enddatum.')
    expect(() => buildRunsExport(db, { dateFrom: '2025-01-01', dateTo: '2026-11-10' }, TODAY)).toThrow('höchstens 366 Tage')
  })
})
