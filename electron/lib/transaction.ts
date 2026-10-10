/**
 * Runs a synchronous function inside a SQLite transaction (BEGIN IMMEDIATE / COMMIT).
 * Any throw triggers ROLLBACK and is rethrown, so multi-statement writes are
 * all-or-nothing. Free of `electron` imports so it works in unit tests.
 *
 * Uses Drizzle's own `db.transaction` (synchronous with node:sqlite via the
 * adapter in db/nodeSqliteAdapter.ts). Nested calls become savepoints.
 * The callback MUST be synchronous (no await inside).
 */
import type { Db } from '../../db/nodeSqliteAdapter'

export type TxDb = Db

export function runInTransaction<T>(db: TxDb, fn: () => T): T {
  let result!: T
  db.transaction(() => {
    result = fn()
  }, { behavior: 'immediate' })
  return result
}
