import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { rotateDailyBackup } from './backupRotation'

describe('rotateDailyBackup', () => {
  let dir: string
  let dbPath: string
  let backupDir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitcoach-backup-'))
    dbPath = path.join(dir, 'fitcoach.db')
    backupDir = path.join(dir, 'backups')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('copies the db to a dated backup file and creates the folder', () => {
    fs.writeFileSync(dbPath, 'DATA-1')
    const out = rotateDailyBackup(dbPath, backupDir, '2026-10-10')
    expect(out).toBe(path.join(backupDir, 'fitcoach-2026-10-10.db'))
    expect(fs.readFileSync(out!, 'utf-8')).toBe('DATA-1')
  })

  it('does nothing when the db file does not exist', () => {
    expect(rotateDailyBackup(dbPath, backupDir, '2026-10-10')).toBeNull()
    expect(fs.existsSync(backupDir)).toBe(false)
  })

  it('does not overwrite an existing backup of the same day', () => {
    fs.writeFileSync(dbPath, 'MORNING')
    rotateDailyBackup(dbPath, backupDir, '2026-10-10')
    fs.writeFileSync(dbPath, 'EVENING')
    const out = rotateDailyBackup(dbPath, backupDir, '2026-10-10')
    expect(out).toBeNull()
    expect(fs.readFileSync(path.join(backupDir, 'fitcoach-2026-10-10.db'), 'utf-8')).toBe('MORNING')
  })

  it('keeps only the newest N backups and ignores unrelated files', () => {
    fs.writeFileSync(dbPath, 'X')
    fs.mkdirSync(backupDir)
    for (let d = 1; d <= 5; d++) {
      fs.writeFileSync(path.join(backupDir, `fitcoach-2026-09-0${d}.db`), 'old')
    }
    fs.writeFileSync(path.join(backupDir, 'notes.txt'), 'keep me')
    fs.writeFileSync(path.join(backupDir, 'fitcoach-latest.db'), 'keep me too')

    rotateDailyBackup(dbPath, backupDir, '2026-10-10', 3)

    const files = fs.readdirSync(backupDir).sort()
    expect(files).toEqual([
      'fitcoach-2026-09-04.db',
      'fitcoach-2026-09-05.db',
      'fitcoach-2026-10-10.db',
      'fitcoach-latest.db',
      'notes.txt',
    ])
  })
})
