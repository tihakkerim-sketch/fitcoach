import { ipcMain } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { UserProfile, HrZone, IpcResponse } from '../../src/types/ipc'
import { getDb, markDirty } from '../../db/index'
import { userProfile, hrZones } from '../../db/schema'
import { eq } from 'drizzle-orm'

export function registerProfileHandlers() {
  ipcMain.handle(
    IPC.PROFILE_GET,
    async (): Promise<IpcResponse<UserProfile | null>> => {
      try {
        const db = getDb()
        const row = db.select().from(userProfile).where(eq(userProfile.id, 1)).get()
        if (!row) return { success: true, data: null }
        return {
          success: true,
          data: {
            ...row,
            fixedRestDays: row.fixedRestDays ? JSON.parse(row.fixedRestDays) : undefined,
            theme: (row.theme ?? 'dark') as 'light' | 'dark',
            weeklyGoalKm: row.weeklyGoalKm ?? undefined,
            weeklyGoalSessions: row.weeklyGoalSessions ?? undefined,
            dailyCalorieTarget: row.dailyCalorieTarget ?? undefined,
            dailyProteinTargetG: row.dailyProteinTargetG ?? undefined,
            dailyWaterTargetMl: row.dailyWaterTargetMl ?? undefined,
          } as UserProfile,
        }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.PROFILE_SAVE,
    async (_e, payload: Partial<UserProfile>): Promise<IpcResponse<void>> => {
      try {
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
          dailyCalorieTarget: payload.dailyCalorieTarget ?? null,
          dailyProteinTargetG: payload.dailyProteinTargetG ?? null,
          dailyWaterTargetMl: payload.dailyWaterTargetMl ?? null,
        }
        if (existing) {
          db.update(userProfile).set(data).where(eq(userProfile.id, 1)).run()
        } else {
          db.insert(userProfile).values({ id: 1, ...data }).run()
        }
        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.HR_ZONES_GET,
    async (): Promise<IpcResponse<HrZone[]>> => {
      try {
        const db = getDb()
        const rows = db.select().from(hrZones).all()
        return { success: true, data: rows as HrZone[] }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.HR_ZONES_SAVE,
    async (_e, zones: HrZone[]): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
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
        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
