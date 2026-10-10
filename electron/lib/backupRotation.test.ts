import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { DatabaseSync } from 'node:sqlite'
import { rotateDailyBackup } from './backupRotation'

function openMarked(file: string, marker: string): DatabaseSync {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('CREATE TABLE IF NOT EXISTS t (v text)')
  db.exec('DELETE FROM t')
  db.prepare('INSERT INTO t (v) VALUES (?)').run(marker)
  return db
}

function readMarker(file: string): string {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return (db.prepare('SELECT v FROM t').get() as { v: string }).v
  } finally {
    db.close()
  }
}

describe('rotateDailyBackup', () => {
  let dir: string
  let backupDir: string
  let db: DatabaseSync

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitcoach-backup-'))
    backupDir = path.join(dir, 'backups')
    db = openMarked(path.join(dir, 'fitcoach.db'), 'DATA-1')
  })

  afterEach(() => {
    try { db.close() } catch { /* already closed */ }
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('writes a complete dated copy (incl. uncheckpointed WAL data) and creates the folder', () => {
    const out = rotateDailyBackup(db, backupDir, '2026-10-10')
    expect(out).toBe(path.join(backupDir, 'fitcoach-2026-10-10.db'))
    expect(readMarker(out!)).toBe('DATA-1')
    expect(fs.readdirSync(backupDir)).toEqual(['fitcoach-2026-10-10.db']) // no .tmp left over
  })

  it('does nothing for an empty (brand-new) database', () => {
    const empty = new DatabaseSync(':memory:')
    expect(rotateDailyBackup(empty, backupDir, '2026-10-10')).toBeNull()
    expect(fs.existsSync(backupDir)).toBe(false)
    empty.close()
  })

  it('does not overwrite an existing backup of the same day', () => {
    rotateDailyBackup(db, backupDir, '2026-10-10')
    db.exec('DELETE FROM t')
    db.prepare('INSERT INTO t (v) VALUES (?)').run('EVENING')
    const out = rotateDailyBackup(db, backupDir, '2026-10-10')
    expect(out).toBeNull()
    expect(readMarker(path.join(backupDir, 'fitcoach-2026-10-10.db'))).toBe('DATA-1')
  })

  it('keeps only the newest N backups and ignores unrelated files', () => {
    fs.mkdirSync(backupDir)
    for (let d = 1; d <= 5; d++) {
      fs.writeFileSync(path.join(backupDir, `fitcoach-2026-09-0${d}.db`), 'old')
    }
    fs.writeFileSync(path.join(backupDir, 'notes.txt'), 'keep me')
    fs.writeFileSync(path.join(backupDir, 'fitcoach-latest.db'), 'keep me too')
    fs.writeFileSync(path.join(backupDir, 'vor-migration-v0-v2-2026-10-10-0700.db'), 'keep me three')

    rotateDailyBackup(db, backupDir, '2026-10-10', 3)

    expect(fs.readdirSync(backupDir).sort()).toEqual([
      'fitcoach-2026-09-04.db',
      'fitcoach-2026-09-05.db',
      'fitcoach-2026-10-10.db',
      'fitcoach-latest.db',
      'notes.txt',
      'vor-migration-v0-v2-2026-10-10-0700.db',
    ])
  })
})
