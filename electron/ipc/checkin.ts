import { IPC } from '../../src/types/ipc'
import type { DailyCheckin } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { dailyCheckins } from '../../db/schema'
import { eq } from 'drizzle-orm'

export function registerCheckinHandlers() {
  // Get check-in for a specific date (returns null if none)
  handle(IPC.CHECKIN_GET, (date) => {
    const row = getDb().select().from(dailyCheckins).where(eq(dailyCheckins.date, date)).get()
    return (row ?? null) as DailyCheckin | null
  })

  // Create or update today's check-in (upsert by date)
  handle(IPC.CHECKIN_UPSERT, (payload) => {
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

    return row as DailyCheckin
  })
}
