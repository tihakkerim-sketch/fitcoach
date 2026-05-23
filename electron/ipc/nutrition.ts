import { ipcMain } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { IpcResponse, NutritionLogEntry, CreateNutritionLogPayload } from '../../src/types/ipc'
import { getDb, markDirty } from '../../db/index'
import { nutritionLogs } from '../../db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'

export function registerNutritionHandlers() {
  // ── Create ──────────────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC.NUTRITION_LOG_CREATE,
    async (_e, payload: CreateNutritionLogPayload): Promise<IpcResponse<NutritionLogEntry>> => {
      try {
        const db = getDb()
        const now = Date.now()
        db.insert(nutritionLogs).values({
          date:      payload.date,
          label:     payload.label ?? null,
          calories:  payload.calories ?? null,
          proteinG:  payload.proteinG ?? null,
          waterMl:   payload.waterMl ?? null,
          note:      payload.note ?? null,
          createdAt: now,
        }).run()

        // Return the inserted row
        const rows = db.select().from(nutritionLogs)
          .where(eq(nutritionLogs.createdAt, now))
          .all()
        const row = rows[rows.length - 1]

        markDirty()
        return {
          success: true,
          data: {
            id:        row.id,
            date:      row.date,
            label:     row.label ?? undefined,
            calories:  row.calories ?? undefined,
            proteinG:  row.proteinG ?? undefined,
            waterMl:   row.waterMl ?? undefined,
            note:      row.note ?? undefined,
            createdAt: row.createdAt,
          },
        }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Get range ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC.NUTRITION_LOGS_GET,
    async (_e, payload: { dateFrom: string; dateTo: string }): Promise<IpcResponse<NutritionLogEntry[]>> => {
      try {
        const db = getDb()
        const rows = db.select().from(nutritionLogs)
          .where(and(
            gte(nutritionLogs.date, payload.dateFrom),
            lte(nutritionLogs.date, payload.dateTo),
          ))
          .all()

        return {
          success: true,
          data: rows.map(r => ({
            id:        r.id,
            date:      r.date,
            label:     r.label ?? undefined,
            calories:  r.calories ?? undefined,
            proteinG:  r.proteinG ?? undefined,
            waterMl:   r.waterMl ?? undefined,
            note:      r.note ?? undefined,
            createdAt: r.createdAt,
          })),
        }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Delete ──────────────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC.NUTRITION_LOG_DELETE,
    async (_e, id: number): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        db.delete(nutritionLogs).where(eq(nutritionLogs.id, id)).run()
        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
