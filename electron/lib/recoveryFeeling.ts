/** „Wie fühlst du dich?" (1–5) pro Tag in `recovery_logs.feeling`. Ändert NUR diese Spalte. Ohne `electron`-Import. */
import { eq } from 'drizzle-orm'
import { recoveryLogs } from '../../db/schema'
import { runInTransaction, type TxDb } from './transaction'

export function setFeeling(db: TxDb, date: string, feeling: number | null, now: number = Date.now()) {
  return runInTransaction(db, () => {
    const existing = db.select().from(recoveryLogs).where(eq(recoveryLogs.date, date)).get()
    if (existing) {
      db.update(recoveryLogs).set({ feeling, updatedAt: now }).where(eq(recoveryLogs.id, existing.id)).run()
    } else {
      db.insert(recoveryLogs).values({ date, feeling, source: 'manual', createdAt: now, updatedAt: now }).run()
    }
    return db.select().from(recoveryLogs).where(eq(recoveryLogs.date, date)).get()!
  })
}
