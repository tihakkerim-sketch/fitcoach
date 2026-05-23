import { ipcMain } from 'electron'
import { IPC } from '../../src/types/ipc'
import type {
  IpcResponse, HabitRow, HabitLogRow, HabitLogsMap, CreateHabitPayload,
} from '../../src/types/ipc'
import { getDb, markDirty } from '../../db/index'
import { habits, habitLogs } from '../../db/schema'
import { eq, and, gte, lte, asc } from 'drizzle-orm'

export function registerHabitHandlers() {
  // Create a new habit
  ipcMain.handle(
    IPC.HABITS_CREATE,
    async (_e, payload: CreateHabitPayload): Promise<IpcResponse<HabitRow>> => {
      try {
        const db = getDb()
        const [row] = db
          .insert(habits)
          .values({ name: payload.name, emoji: payload.emoji, color: payload.color, createdAt: Date.now() })
          .returning()
          .all()
        markDirty()
        return { success: true, data: row as HabitRow }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // List active habits (not archived)
  ipcMain.handle(
    IPC.HABITS_LIST,
    async (): Promise<IpcResponse<HabitRow[]>> => {
      try {
        const db  = getDb()
        const rows = db.select().from(habits).orderBy(asc(habits.createdAt)).all()
        const active = rows.filter(r => !r.archivedAt)
        return { success: true, data: active as HabitRow[] }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // Archive (soft-delete) a habit
  ipcMain.handle(
    IPC.HABITS_DELETE,
    async (_e, id: number): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        db.update(habits).set({ archivedAt: Date.now() }).where(eq(habits.id, id)).run()
        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // Toggle a habit log for a specific date
  ipcMain.handle(
    IPC.HABIT_LOG_TOGGLE,
    async (_e, { habitId, date }: { habitId: number; date: string }): Promise<IpcResponse<boolean>> => {
      try {
        const db = getDb()
        const existing = db
          .select()
          .from(habitLogs)
          .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)))
          .get()

        if (existing) {
          db.delete(habitLogs).where(eq(habitLogs.id, existing.id)).run()
          markDirty()
          return { success: true, data: false }   // now uncompleted
        } else {
          db.insert(habitLogs).values({ habitId, date, completedAt: Date.now() }).run()
          markDirty()
          return { success: true, data: true }    // now completed
        }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // Get habit logs for a date range → map of date → habitId[]
  ipcMain.handle(
    IPC.HABIT_LOGS_GET,
    async (_e, { dateFrom, dateTo }: { dateFrom: string; dateTo: string }): Promise<IpcResponse<HabitLogsMap>> => {
      try {
        const db   = getDb()
        const rows = db
          .select()
          .from(habitLogs)
          .where(and(gte(habitLogs.date, dateFrom), lte(habitLogs.date, dateTo)))
          .all() as HabitLogRow[]

        const map: HabitLogsMap = {}
        for (const r of rows) {
          if (!map[r.date]) map[r.date] = []
          map[r.date].push(r.habitId)
        }
        return { success: true, data: map }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
