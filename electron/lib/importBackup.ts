/**
 * Pure backup import logic — deliberately free of any `electron` imports so it
 * can be unit-tested against an in-memory database.
 *
 * Safety contract: existing data must NEVER be lost to a malformed or partially
 * invalid backup. The shape is validated first (failing before any delete), and
 * the whole replace then runs inside ONE transaction, so any failure rolls
 * everything back automatically.
 *
 * Versions: v1/v2 replace only the original tables (newer tables are left
 * untouched); v3–v7 replace all current tables (activitySplits/-Streams exist since v6, shoes since v7, planProposals since v8; older files simply have none). v1–v4 contain the old phase-based
 * plans; those are converted to the plan-v2 model (`convertLegacyPlans`) before validation. Keys of tables that no longer
 * exist (habits, nutrition, body, challenges in v3 files) are ignored.
 */
import { getTableColumns } from 'drizzle-orm'
import { BACKUP_TABLES, type BackupTable } from './backupFormat'
import { convertLegacyPlans } from './legacyPlan'
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

const LEGACY_PLAN_KEYS = ['trainingPlans', 'planPhases', 'planWeeks', 'planSessions', 'activities'] as const

/**
 * v1–v4: ersetzt die alten Phasen-Pläne durch Plan-v2-Zeilen. `planPhases` darf fehlen (= leer).
 * Gibt eine Fehlermeldung zurück, wenn ein Plan-Feld kaputt ist (vor jeder Änderung an der DB).
 */
function upgradeLegacyPlans(data: Record<string, unknown>, strict: boolean): string | null {
  for (const key of LEGACY_PLAN_KEYS) {
    const v = data[key]
    if (v === undefined) {
      if (strict && key !== 'planPhases') return `Backup field "${key}" is missing — import cancelled, your data is unchanged`
      continue
    }
    if (!Array.isArray(v) || !v.every(isPlainObject)) {
      return `Backup field "${key}" is malformed — import cancelled, your data is unchanged`
    }
  }
  const list = (key: string) => (Array.isArray(data[key]) ? data[key] : []) as never[]
  try {
    const converted = convertLegacyPlans({
      plans: list('trainingPlans'), phases: list('planPhases'), weeks: list('planWeeks'),
      sessions: list('planSessions'), activities: list('activities'),
    })
    data.trainingPlans = converted.plans
    data.planWeeks = converted.weeks
    data.planSessions = converted.sessions
    delete data.planPhases
  } catch (err) {
    return `Backup plans could not be converted: ${String(err)} — import cancelled, your data is unchanged`
  }
  return null
}

/**
 * Replace data with the contents of a parsed backup object.
 * On any failure the transaction is rolled back, the previous data stays
 * exactly as it was, and `success: false` is returned.
 */
export function importBackup(db: Db, backup: Record<string, unknown>): ImportResult {
  let data = backup
  // ── Version gate ──────────────────────────────────────────────────────────
  const version = data.version as number
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7 && version !== 8) {
    return { success: false, error: 'Unrecognised backup format or version — import cancelled, your data is unchanged' }
  }

  // v1/v2 only know the original tables; v3+ know all current ones.
  const full = version >= 3

  // v1–v4: alte Phasen-Pläne umwandeln (auf einer Kopie, das Eingabeobjekt bleibt unverändert)
  if (version <= 4) {
    data = { ...data }
    const planError = upgradeLegacyPlans(data, full)
    if (planError) return { success: false, error: planError }
  }
  const tables: BackupTable[] = BACKUP_TABLES.filter(t => full || t.legacy)

  // ── Validate shape BEFORE touching the DB ───────────────────────────────────
  // Every present table key must be an array of objects. A v3/v4 file must contain
  // every table (a missing one would silently wipe that table). A malformed file
  // is rejected before a single row is deleted.
  for (const { key, since } of tables) {
    const value = data[key]
    if (value === undefined) {
      if (full && version >= (since ?? 0)) {
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
    // Keys of removed tables (coach*, habits*, nutrition, body, challenges) are silently ignored
    return { success: true }
  } catch (importErr) {
    return {
      success: false,
      error: `Import failed and your previous data was restored: ${String(importErr)}`,
    }
  }
}
