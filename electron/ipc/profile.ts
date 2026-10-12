import { IPC } from '../../src/types/ipc'
import type { UserProfile, HrZone } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { userProfile, hrZones } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { runInTransaction } from '../lib/transaction'

export function registerProfileHandlers() {
  handle(IPC.PROFILE_GET, () => {
    const row = getDb().select().from(userProfile).where(eq(userProfile.id, 1)).get()
    if (!row) return null
    return {
      ...row,
      fixedRestDays: row.fixedRestDays ? JSON.parse(row.fixedRestDays) : undefined,
      theme: (row.theme ?? 'dark') as 'light' | 'dark',
      weeklyGoalKm: row.weeklyGoalKm ?? undefined,
      weeklyGoalSessions: row.weeklyGoalSessions ?? undefined,
      dayStartHour: row.dayStartHour,
    } as UserProfile
  })

  handle(IPC.PROFILE_SAVE, (payload) => {
    const db = getDb()
    const existing = db.select().from(userProfile).where(eq(userProfile.id, 1)).get()
    const data = {
      name: payload.name ?? null,
      age: payload.age ?? null,
      maxHr: payload.maxHr ?? null,
      restingHr: payload.restingHr ?? null,
      goalEvent: payload.goalEvent ?? null,
      goalFinishTime: payload.goalFinishTime ?? null,
      trainingDaysPerWeek: payload.trainingDaysPerWeek ?? null,
      fixedRestDays: payload.fixedRestDays
        ? JSON.stringify(payload.fixedRestDays)
        : null,
      injuryNotes: payload.injuryNotes ?? null,
      theme: payload.theme ?? 'dark',
      weeklyGoalKm: payload.weeklyGoalKm ?? null,
      weeklyGoalSessions: payload.weeklyGoalSessions ?? null,
    }
    // Tageswechsel nur ändern, wenn mitgeschickt (sonst bleibt der alte Wert / Standard 4)
    const dayStart = payload.dayStartHour == null ? {} : { dayStartHour: payload.dayStartHour }
    if (existing) {
      db.update(userProfile).set({ ...data, ...dayStart }).where(eq(userProfile.id, 1)).run()
    } else {
      db.insert(userProfile).values({ id: 1, ...data, ...dayStart }).run()
    }
  })

  handle(IPC.HR_ZONES_GET, () => getDb().select().from(hrZones).all() as HrZone[])

  handle(IPC.HR_ZONES_SAVE, (zones) => {
    const db = getDb()
    // One transaction: a failing insert must not leave the zones deleted
    runInTransaction(db, () => {
      db.delete(hrZones).run()
      for (const z of zones) {
        db.insert(hrZones)
          .values({
            zoneNumber: z.zoneNumber,
            minHr: z.minHr,
            maxHr: z.maxHr,
            label: z.label,
          })
          .run()
      }
    })
  })
}
