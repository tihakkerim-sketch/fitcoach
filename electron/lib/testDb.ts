/**
 * Test-only helper: in-memory node:sqlite database with the REAL migrations
 * applied, wrapped with Drizzle exactly like the app does. Not imported by app code.
 */
import { DatabaseSync } from 'node:sqlite'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createDrizzle, type Db } from '../../db/nodeSqliteAdapter'
import { runMigrations } from '../../db/migrations'

export type TestDb = Db

export function makeMemoryDb(): DatabaseSync {
  const raw = new DatabaseSync(':memory:')
  raw.exec('PRAGMA foreign_keys = ON')
  return raw
}

export async function makeTestDb(): Promise<TestDb> {
  const raw = makeMemoryDb()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitcoach-testdb-'))
  try {
    runMigrations(raw, dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return createDrizzle(raw)
}
