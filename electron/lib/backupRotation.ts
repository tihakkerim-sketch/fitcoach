/**
 * Daily automatic backup of the SQLite database — free of `electron` imports so
 * it can be unit-tested with a temp directory.
 *
 * Called right after the database is opened and BEFORE migrations, so the copy
 * is the untouched state from the last run. One file per local calendar day,
 * oldest pruned. Uses `VACUUM INTO` (a plain file copy would be incomplete in
 * WAL mode).
 */
import * as fs from 'fs'
import * as path from 'path'
import type { DatabaseSync } from 'node:sqlite'
import { vacuumInto } from '../../db/migrations'

const BACKUP_RE = /^fitcoach-\d{4}-\d{2}-\d{2}\.db$/

/**
 * @param today  local date as YYYY-MM-DD (NOT UTC)
 * @param keep   how many dated backups to retain
 * @returns path of the newly created backup, or null if none was created
 *          (empty/new database, or today's backup already exists)
 */
export function rotateDailyBackup(
  db: DatabaseSync,
  backupDir: string,
  today: string,
  keep = 14
): string | null {
  const hasTables = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' LIMIT 1").get() !== undefined
  if (!hasTables) return null

  fs.mkdirSync(backupDir, { recursive: true })

  const target = path.join(backupDir, `fitcoach-${today}.db`)
  let created: string | null = null
  if (!fs.existsSync(target)) {
    vacuumInto(db, target)
    created = target
  }

  // Dates are zero-padded ISO, so a plain string sort is chronological.
  const dated = fs.readdirSync(backupDir).filter(f => BACKUP_RE.test(f)).sort()
  const excess = dated.length - Math.max(keep, 1)
  for (const f of dated.slice(0, Math.max(excess, 0))) {
    fs.unlinkSync(path.join(backupDir, f))
  }

  return created
}
