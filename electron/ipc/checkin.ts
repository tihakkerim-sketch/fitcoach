import { ipcMain } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { IpcResponse, DailyCheckin, UpsertCheckinPayload } from '../../src/types/ipc'
import { getDb, markDirty } from '../../db/index'
import { dailyCheckins } from '../../db/schema'
import { eq } from 'drizzle-orm'

export function registerCheckinHandlers() {
  // Get check-in for a specific date (returns null if none)
  ipcMain.handle(
    IPC.CHECKIN_GET,
    async (_e, date: string): Promise<IpcResponse<DailyCheckin | null>> => {
      try {
        const db  = getDb()
        const row = db.select().from(dailyCheckins).where(eq(dailyCheckins.date, date)).get()
        return { success: true, data: (row ?? null) as DailyCheckin | null }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // Create or update today's check-in (upsert by date)
  ipcMain.handle(
    IPC.CHECKIN_UPSERT,
    async (_e, payload: UpsertCheckinPayload): Promise<IpcResponse<DailyCheckin>> => {
      try {
        const db      = getDb()
        const now     = Date.now()
        const existing = db
          .select()
          .from(dailyCheckins)
          .where(eq(dailyCheckins.date, payload.date))
          .get()

        const fields = {
          morningEnergy:    payload.morningEnergy    ?? null,
          morningClarity:   payload.morningClarity   ?? null,
          morningIntention: payload.morningIntention ?? null,
          eveningRating:    payload.eveningRating    ?? null,
          eveningWins:      payload.eveningWins      ?? null,
          eveningNote:      payload.eveningNote      ?? null,
          updatedAt:        now,
        }

        let row: unknown
        if (existing) {
          const updated = db
            .update(dailyCheckins)
            .set(fields)
            .where(eq(dailyCheckins.date, payload.date))
            .returning()
            .all()
          row = updated[0]
        } else {
          const inserted = db
            .insert(dailyCheckins)
            .values({ ...fields, date: payload.date, createdAt: now })
            .returning()
            .all()
          row = inserted[0]
        }

        markDirty()
        return { success: true, data: row as DailyCheckin }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
