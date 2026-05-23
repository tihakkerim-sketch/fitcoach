import { ipcMain } from 'electron'
import { format, subDays } from 'date-fns'
import { IPC } from '../../src/types/ipc'
import type {
  IpcResponse,
  DailyChallenge,
  ChallengePoolEntry,
  TodayChallengesResult,
  AddChallengePayload,
} from '../../src/types/ipc'
import { getDb, markDirty } from '../../db/index'
import { challengePool, dailyChallenges } from '../../db/schema'
import { eq, asc } from 'drizzle-orm'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function rowToChallenge(r: {
  id: number
  date: string
  poolId: number | null
  text: string
  completed: number
  completedAt: number | null
}): DailyChallenge {
  return {
    id:          r.id,
    date:        r.date,
    poolId:      r.poolId ?? undefined,
    text:        r.text,
    completed:   r.completed === 1,
    completedAt: r.completedAt ?? undefined,
  }
}

function rowToPoolEntry(r: {
  id: number
  text: string
  category: string
  isBuiltIn: number
  isActive: number
}): ChallengePoolEntry {
  return {
    id:        r.id,
    text:      r.text,
    category:  r.category as ChallengePoolEntry['category'],
    isBuiltIn: r.isBuiltIn === 1,
    isActive:  r.isActive === 1,
  }
}

/**
 * Compute how many consecutive days (up to and including today) had ALL
 * challenges completed. A day with zero challenges counts as a break.
 */
function computeStreak(db: ReturnType<typeof getDb>): number {
  const today  = todayStr()
  const cutoff = format(subDays(new Date(), 365), 'yyyy-MM-dd')

  // Load all rows for the last year (YYYY-MM-DD strings compare correctly lexicographically)
  const rows = db
    .select()
    .from(dailyChallenges)
    .all()
    .filter(r => r.date >= cutoff)

  // Group by date: { date → { total, done } }
  const byDate = new Map<string, { total: number; done: number }>()
  for (const r of rows) {
    const e = byDate.get(r.date) ?? { total: 0, done: 0 }
    e.total++
    if (r.completed) e.done++
    byDate.set(r.date, e)
  }

  let streak = 0
  let d = today
  for (let i = 0; i < 366; i++) {
    const entry = byDate.get(d)
    if (!entry || entry.total === 0 || entry.done < entry.total) break
    streak++
    d = format(subDays(new Date(d + 'T12:00:00'), 1), 'yyyy-MM-dd')
  }

  return streak
}

// ── Handler registration ──────────────────────────────────────────────────────

export function registerChallengeHandlers() {
  // Get (or generate) today's challenges + streak
  ipcMain.handle(
    IPC.CHALLENGES_TODAY_GET,
    async (): Promise<IpcResponse<TodayChallengesResult>> => {
      try {
        const db    = getDb()
        const today = todayStr()

        // Check if today's challenges already exist
        let todayRows = db
          .select()
          .from(dailyChallenges)
          .where(eq(dailyChallenges.date, today))
          .all()

        if (todayRows.length === 0) {
          // Pick 3 random challenges from the active pool
          const pool = db
            .select()
            .from(challengePool)
            .where(eq(challengePool.isActive, 1))
            .all()

          if (pool.length > 0) {
            // Fisher-Yates shuffle, take first 3
            const shuffled = [...pool]
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
            }
            const picks = shuffled.slice(0, Math.min(3, shuffled.length))

            for (const pick of picks) {
              db.insert(dailyChallenges).values({
                date:      today,
                poolId:    pick.id,
                text:      pick.text,
                completed: 0,
              }).run()
            }
            markDirty()

            todayRows = db
              .select()
              .from(dailyChallenges)
              .where(eq(dailyChallenges.date, today))
              .all()
          }
        }

        const challenges = todayRows.map(rowToChallenge)
        const streak     = computeStreak(db)

        return { success: true, data: { challenges, streak } }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // Toggle a challenge's completed state
  ipcMain.handle(
    IPC.CHALLENGE_TOGGLE,
    async (_e, id: number): Promise<IpcResponse<DailyChallenge>> => {
      try {
        const db = getDb()
        const existing = db
          .select()
          .from(dailyChallenges)
          .where(eq(dailyChallenges.id, id))
          .get()
        if (!existing) return { success: false, error: 'Challenge not found' }

        const nowCompleted = existing.completed === 0 ? 1 : 0
        db.update(dailyChallenges)
          .set({
            completed:   nowCompleted,
            completedAt: nowCompleted === 1 ? Date.now() : null,
          })
          .where(eq(dailyChallenges.id, id))
          .run()
        markDirty()

        const updated = db
          .select()
          .from(dailyChallenges)
          .where(eq(dailyChallenges.id, id))
          .get()!
        return { success: true, data: rowToChallenge(updated) }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // List all pool entries
  ipcMain.handle(
    IPC.CHALLENGE_POOL_LIST,
    async (): Promise<IpcResponse<ChallengePoolEntry[]>> => {
      try {
        const db   = getDb()
        const rows = db
          .select()
          .from(challengePool)
          .orderBy(asc(challengePool.isBuiltIn), asc(challengePool.id))
          // built-ins first (is_built_in DESC), then custom by id
          .all()
          .sort((a, b) => (b.isBuiltIn - a.isBuiltIn) || (a.id - b.id))
        return { success: true, data: rows.map(rowToPoolEntry) }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // Add a custom pool entry
  ipcMain.handle(
    IPC.CHALLENGE_POOL_ADD,
    async (_e, payload: AddChallengePayload): Promise<IpcResponse<ChallengePoolEntry>> => {
      try {
        const db = getDb()
        const [row] = db
          .insert(challengePool)
          .values({
            text:      payload.text.trim(),
            category:  payload.category,
            isBuiltIn: 0,
            isActive:  1,
          })
          .returning()
          .all()
        markDirty()
        return { success: true, data: rowToPoolEntry(row) }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // Toggle isActive on a pool entry (works for both built-in and custom)
  ipcMain.handle(
    IPC.CHALLENGE_POOL_TOGGLE_ACTIVE,
    async (_e, id: number): Promise<IpcResponse<ChallengePoolEntry>> => {
      try {
        const db = getDb()
        const existing = db
          .select()
          .from(challengePool)
          .where(eq(challengePool.id, id))
          .get()
        if (!existing) return { success: false, error: 'Pool entry not found' }

        const newActive = existing.isActive === 1 ? 0 : 1
        db.update(challengePool)
          .set({ isActive: newActive })
          .where(eq(challengePool.id, id))
          .run()
        markDirty()

        const updated = db
          .select()
          .from(challengePool)
          .where(eq(challengePool.id, id))
          .get()!
        return { success: true, data: rowToPoolEntry(updated) }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // Delete a custom pool entry (built-ins are protected)
  ipcMain.handle(
    IPC.CHALLENGE_POOL_DELETE,
    async (_e, id: number): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const existing = db
          .select()
          .from(challengePool)
          .where(eq(challengePool.id, id))
          .get()
        if (!existing)           return { success: false, error: 'Pool entry not found' }
        if (existing.isBuiltIn)  return { success: false, error: 'Cannot delete built-in challenges' }

        db.delete(challengePool).where(eq(challengePool.id, id)).run()
        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
