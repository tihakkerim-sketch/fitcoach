/** Schlüssel/Wert-Einstellungen (Tabelle app_settings). Ohne `electron`-Import. */
import { eq } from 'drizzle-orm'
import { appSettings } from '../../db/schema'
import type { TxDb } from './transaction'

export function getSetting(db: TxDb, key: string): string | null {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  return row ? row.value : null
}

export function setSetting(db: TxDb, key: string, value: string): void {
  db.insert(appSettings).values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run()
}

export function deleteSetting(db: TxDb, key: string): void {
  db.delete(appSettings).where(eq(appSettings.key, key)).run()
}
