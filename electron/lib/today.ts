/** „Heute" der App mit einstellbarem Tageswechsel (Profil `day_start_hour`). Ohne `electron`-Import. */
import { eq } from 'drizzle-orm'
import { userProfile } from '../../db/schema'
import { todayLocal } from '../../src/shared/planCalendar'
import type { TxDb } from './transaction'

export const DEFAULT_DAY_START_HOUR = 4

export function getDayStartHour(db: TxDb): number {
  const row = db.select({ h: userProfile.dayStartHour }).from(userProfile).where(eq(userProfile.id, 1)).get()
  return row?.h ?? DEFAULT_DAY_START_HOUR
}

export function appToday(db: TxDb, now: Date = new Date()): string {
  return todayLocal(now, getDayStartHour(db))
}
