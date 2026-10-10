/**
 * Pure backup import logic — deliberately free of any `electron` imports so it
 * can be unit-tested against an in-memory database.
 *
 * Safety contract: existing data must NEVER be lost to a malformed or partially
 * invalid backup. The shape is validated first (failing before any delete), and
 * the whole replace then runs inside ONE transaction, so any failure rolls
 * everything back automatically.
 *
 * Versions: v1/v2 replace only the original 7 tables (newer tables are left
 * untouched); v3 replaces all tables.
 */
import { getTableColumns } from 'drizzle-orm'
import { BACKUP_TABLES, type BackupTable } from './backupFormat'
import { runInTransaction, type TxDb } from './transaction'

export type Db = TxDb

export interface ImportResult {
  success: boolean
  error?: string
}

// SQLite limits bound parameters per statement — insert large tables in chunks.
const MAX_PARAMS_PER_INSERT = 900

function isPlainObject(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Replace data with the contents of a parsed backup object.
 * On any failure the transaction is rolled back, the previous data stays
 * exactly as it was, and `success: false` is returned.
 */
export function importBackup(db: Db, data: Record<string, unknown>): ImportResult {
  // ── Version gate ──────────────────────────────────────────────────────────
  const version = data.version as number
  if (version !== 1 && version !== 2 && version !== 3) {
    return { success: false, error: 'Unrecognised backup format or version — import cancelled, your data is unchanged' }
  }

  // v1/v2 only know the original tables; v3 knows them all.
  const tables: BackupTable[] = BACKUP_TABLES.filter(t => version === 3 || t.legacy)

  // ── Validate shape BEFORE touching the DB ───────────────────────────────────
  // Every present table key must be an array of objects. A v3 file must contain
  // every table (a missing one would silently wipe that table). A malformed file
  // is rejected before a single row is deleted.
  for (const { key } of tables) {
    const value = data[key]
    if (value === undefined) {
      if (version === 3) {
        return { success: false, error: `Backup field "${key}" is missing — import cancelled, your data is unchanged` }
      }
      continue
    }
    if (!Array.isArray(value) || !value.every(isPlainObject)) {
      return { success: false, error: `Backup field "${key}" is malformed — import cancelled, your data is unchanged` }
    }
  }

  try {
    runInTransaction(db, () => {
      // Children before parents
      for (const { table } of [...tables].reverse()) {
        db.delete(table).run()
      }
      // Parents before children
      for (const { key, table } of tables) {
        const rows = data[key]
        if (!Array.isArray(rows) || rows.length === 0) continue
        const chunk = Math.max(1, Math.floor(MAX_PARAMS_PER_INSERT / Object.keys(getTableColumns(table)).length))
        for (let i = 0; i < rows.length; i += chunk) {
          db.insert(table).values(rows.slice(i, i + chunk) as never[]).run()
        }
      }
    })
    // v1 backups may contain coachConversations / coachMessages — silently ignored
    return { success: true }
  } catch (importErr) {
    return {
      success: false,
      error: `Import failed and your previous data was restored: ${String(importErr)}`,
    }
  }
}
