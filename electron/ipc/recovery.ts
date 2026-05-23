import { ipcMain } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { IpcResponse, RecoveryLog, UpsertRecoveryLogPayload } from '../../src/types/ipc'
import { getDb, markDirty } from '../../db/index'
import { recoveryLogs } from '../../db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'
import { calcReadiness } from '../../src/lib/recoveryScore'

function rowToLog(r: typeof recoveryLogs.$inferSelect): RecoveryLog {
  return {
    id:             r.id,
    date:           r.date,
    hrvRmssd:       r.hrvRmssd       ?? undefined,
    bodyBattery:    r.bodyBattery    ?? undefined,
    sleepScore:     r.sleepScore     ?? undefined,
    readinessScore: r.readinessScore ?? undefined,
    restingHr:      r.restingHr      ?? undefined,
    note:           r.note           ?? undefined,
    source:         (r.source as RecoveryLog['source']) ?? 'manual',
    createdAt:      r.createdAt,
    updatedAt:      r.updatedAt,
  }
}

export function registerRecoveryHandlers() {
  // ── Upsert (create or update for a date) ────────────────────────────────────

  ipcMain.handle(
    IPC.RECOVERY_LOG_UPSERT,
    async (_e, payload: UpsertRecoveryLogPayload): Promise<IpcResponse<RecoveryLog>> => {
      try {
        const db  = getDb()
        const now = Date.now()

        const existing = db.select().from(recoveryLogs)
          .where(eq(recoveryLogs.date, payload.date))
          .get()

        // Always auto-calculate readiness from the other metrics
        const readinessScore = calcReadiness({
          bodyBattery: payload.bodyBattery,
          sleepScore:  payload.sleepScore,
          hrvRmssd:    payload.hrvRmssd,
          restingHr:   payload.restingHr,
        })

        const data = {
          date:           payload.date,
          hrvRmssd:       payload.hrvRmssd    ?? null,
          bodyBattery:    payload.bodyBattery  ?? null,
          sleepScore:     payload.sleepScore   ?? null,
          readinessScore: readinessScore       ?? null,
          restingHr:      payload.restingHr    ?? null,
          note:           payload.note         ?? null,
          source:         payload.source       ?? 'manual',
        }

        if (existing) {
          db.update(recoveryLogs)
            .set({ ...data, updatedAt: now })
            .where(eq(recoveryLogs.id, existing.id))
            .run()
        } else {
          db.insert(recoveryLogs)
            .values({ ...data, createdAt: now, updatedAt: now })
            .run()
        }

        markDirty()

        const row = db.select().from(recoveryLogs)
          .where(eq(recoveryLogs.date, payload.date))
          .get()!

        return { success: true, data: rowToLog(row) }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Get range ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC.RECOVERY_LOGS_GET,
    async (_e, payload: { dateFrom: string; dateTo: string }): Promise<IpcResponse<RecoveryLog[]>> => {
      try {
        const db   = getDb()
        const rows = db.select().from(recoveryLogs)
          .where(and(
            gte(recoveryLogs.date, payload.dateFrom),
            lte(recoveryLogs.date, payload.dateTo),
          ))
          .all()

        return { success: true, data: rows.map(rowToLog) }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Delete ──────────────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC.RECOVERY_LOG_DELETE,
    async (_e, id: number): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        db.delete(recoveryLogs).where(eq(recoveryLogs.id, id)).run()
        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
