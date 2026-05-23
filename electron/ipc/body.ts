import { ipcMain } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { IpcResponse, BodyMetricRow, CreateBodyMetricPayload } from '../../src/types/ipc'
import { getDb, markDirty } from '../../db/index'
import { bodyMetrics } from '../../db/schema'
import { eq, desc } from 'drizzle-orm'

export function registerBodyHandlers() {
  ipcMain.handle(
    IPC.BODY_CREATE,
    async (_e, payload: CreateBodyMetricPayload): Promise<IpcResponse<BodyMetricRow>> => {
      try {
        const db = getDb()
        const [row] = db
          .insert(bodyMetrics)
          .values({
            date:       payload.date,
            weightKg:   payload.weightKg   ?? null,
            bodyFatPct: payload.bodyFatPct ?? null,
            note:       payload.note       ?? null,
            createdAt:  Date.now(),
          })
          .returning()
          .all()
        markDirty()
        return { success: true, data: row as BodyMetricRow }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.BODY_LIST,
    async (_e, limit = 90): Promise<IpcResponse<BodyMetricRow[]>> => {
      try {
        const db   = getDb()
        const rows = db
          .select()
          .from(bodyMetrics)
          .orderBy(desc(bodyMetrics.date))
          .limit(limit)
          .all()
        return { success: true, data: rows as BodyMetricRow[] }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.BODY_DELETE,
    async (_e, id: number): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        db.delete(bodyMetrics).where(eq(bodyMetrics.id, id)).run()
        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
