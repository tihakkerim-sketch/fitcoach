/**
 * Runs a synchronous function inside a SQLite transaction (BEGIN / COMMIT).
 * Any throw triggers ROLLBACK and is rethrown, so multi-statement writes are
 * all-or-nothing. Free of `electron` imports so it works in unit tests.
 *
 * Uses Drizzle's own `db.transaction`, which for the sql-js driver is
 * synchronous. The callback MUST be synchronous (no await inside).
 */
import type { drizzle } from 'drizzle-orm/sql-js'
import type * as schema from '../../db/schema'

export type TxDb = ReturnType<typeof drizzle<typeof schema>>

export function runInTransaction<T>(db: TxDb, fn: () => T): T {
  let result!: T
  db.transaction(() => {
    result = fn()
  })
  return result
}
