import { DatabaseSync } from 'node:sqlite'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { format } from 'date-fns'
import { createDrizzle, type Db } from './nodeSqliteAdapter'
import { runMigrations } from './migrations'
import { rotateDailyBackup } from '../electron/lib/backupRotation'

let db: Db | null = null
let sqlite: DatabaseSync | null = null

/**
 * Opens `userData/fitcoach.db` (WAL), makes the daily backup, runs migrations.
 * Throws if migrations fail — the caller shows an error dialog and quits.
 */
export async function initDb(): Promise<void> {
  if (db) return
  const userDataPath = app.getPath('userData')
  fs.mkdirSync(userDataPath, { recursive: true })
  const backupDir = path.join(userDataPath, 'backups')

  const conn = new DatabaseSync(path.join(userDataPath, 'fitcoach.db'))
  try {
    conn.exec('PRAGMA journal_mode = WAL')
    conn.exec('PRAGMA synchronous = NORMAL')
    conn.exec('PRAGMA busy_timeout = 5000')
    conn.exec('PRAGMA foreign_keys = ON')

    // Daily automatic backup of the untouched pre-migration state.
    // A backup failure must never prevent the app from starting.
    try {
      rotateDailyBackup(conn, backupDir, format(new Date(), 'yyyy-MM-dd')) // local date, not UTC
    } catch (err) {
      console.error('Daily backup failed:', err)
    }

    runMigrations(conn, backupDir)
  } catch (err) {
    try { conn.close() } catch { /* ignore */ }
    throw err
  }

  sqlite = conn
  db = createDrizzle(conn)
}

/** Idempotent (called on `session-end` AND `before-quit`). */
export function closeDb(): void {
  if (!sqlite) return
  const conn = sqlite
  sqlite = null
  db = null
  try {
    conn.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } catch (err) {
    console.error('WAL checkpoint failed:', err)
  }
  try {
    conn.close()
  } catch (err) {
    console.error('Closing database failed:', err)
  }
}

export function getDb(): Db {
  if (!db) throw new Error('Database not initialised — call initDb() first')
  return db
}
