/**
 * DB → Coach-Status. Ohne `electron`-Import (testbar mit In-Memory-DB).
 */
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import { activities, hrZones, recoveryLogs, trainingPlans, userProfile } from '../../db/schema'
import { addDaysStr } from '../../src/shared/planCalendar'
import {
  buildCoachStatus, resolveHrBasics,
  type CoachActivity, type CoachStatus, type HrBasics, type ZoneDef,
} from '../../src/shared/coach'
import { getPlanDetail } from './planRead'
import type { TxDb } from './transaction'

export function loadSavedZones(db: TxDb): ZoneDef[] {
  return db.select().from(hrZones).orderBy(asc(hrZones.zoneNumber)).all()
    .map(z => ({ zoneNumber: z.zoneNumber, minHr: z.minHr, maxHr: z.maxHr, label: z.label }))
}

export function loadProfile(db: TxDb) {
  return db.select().from(userProfile).where(eq(userProfile.id, 1)).get() ?? null
}

/** Höchster gemessener Max-Puls aus Läufen der letzten 365 Tage. */
function observedMaxHr(db: TxDb, today: string): number | null {
  const rows = db.select({ maxHr: activities.maxHr }).from(activities)
    .where(and(eq(activities.type, 'running'), gte(activities.date, addDaysStr(today, -364)), lte(activities.date, today)))
    .all()
  const vals = rows.map(r => r.maxHr).filter((v): v is number => typeof v === 'number' && v > 0)
  return vals.length ? Math.max(...vals) : null
}

export function loadRecoveryLogs(db: TxDb, from: string, to: string) {
  return db.select().from(recoveryLogs)
    .where(and(gte(recoveryLogs.date, from), lte(recoveryLogs.date, to)))
    .orderBy(asc(recoveryLogs.date)).all()
}

/** Puls-Grundwerte (Max/Ruhe) aus Profil, Läufen und Recovery – wie im Coach-Status. */
export function loadHrBasics(db: TxDb, today: string): HrBasics | null {
  const profile = loadProfile(db)
  const restHrs = loadRecoveryLogs(db, addDaysStr(today, -29), today)
    .map(l => l.restingHr).filter((v): v is number => typeof v === 'number' && v > 0)
  return resolveHrBasics({
    profileMaxHr: profile?.maxHr,
    profileRestHr: profile?.restingHr,
    observedMaxHr: observedMaxHr(db, today),
    recoveryRestHrs: restHrs,
  })
}

export function toCoachActivity(a: typeof activities.$inferSelect): CoachActivity {
  return {
    date: a.date, type: a.type, durationMin: a.durationMin, distanceKm: a.distanceKm,
    avgHr: a.avgHr, perceivedEffort: a.perceivedEffort,
  }
}

/** Aktiver Plan (höchste ID mit isActive=1) als Detail, sonst null. */
export function getActivePlanDetail(db: TxDb) {
  const row = db.select({ id: trainingPlans.id }).from(trainingPlans)
    .where(eq(trainingPlans.isActive, 1)).orderBy(desc(trainingPlans.id)).get()
  return row ? getPlanDetail(db, row.id) : null
}

export function getCoachStatus(db: TxDb, today: string): CoachStatus {
  const acts = db.select().from(activities)
    .where(and(gte(activities.date, addDaysStr(today, -179)), lte(activities.date, today)))
    .all().map(toCoachActivity)
  const profile = loadProfile(db)
  const plan = getActivePlanDetail(db)

  let plannedNext7Km: number | null = null
  if (plan) {
    const from = addDaysStr(today, 1)
    const to = addDaysStr(today, 7)
    plannedNext7Km = plan.weeks.flatMap(w => w.sessions)
      .filter(s => s.type === 'running' && s.status === 'planned' && s.date >= from && s.date <= to)
      .reduce((sum, s) => sum + (s.targetDistanceKm ?? 0), 0)
  }

  return buildCoachStatus({
    today,
    activities: acts,
    savedZones: loadSavedZones(db),
    profile,
    recoveryLogs: loadRecoveryLogs(db, addDaysStr(today, -29), today),
    plannedNext7Km,
    goalEventOverride: profile?.goalEvent ? null : plan?.goalEvent ?? null,
    observedMaxHr: observedMaxHr(db, today),
  })
}
