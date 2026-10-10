/**
 * Adapter: Drizzle (better-sqlite3 session, synchronous) on top of Node's
 * built-in `node:sqlite` (`DatabaseSync`).
 *
 * Drizzle 0.45 has no stable node:sqlite driver. Its better-sqlite3 session only
 * needs a tiny client API: `prepare(sql)` -> { run, all, get, raw() }, and
 * `transaction(fn)` -> function with `.deferred/.immediate/.exclusive`.
 * We rebuild exactly that here. `drizzle-orm/better-sqlite3` (driver.js) is NOT
 * imported because it imports the `better-sqlite3` package at load time.
 *
 * Free of `electron` imports (usable in unit tests).
 */
import type { DatabaseSync } from 'node:sqlite'
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core/db'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core/dialect'
import { BetterSQLiteSession } from 'drizzle-orm/better-sqlite3/session'
import { createTableRelationsHelpers, extractTablesRelationalConfig } from 'drizzle-orm/relations'
import * as schema from './schema'

export type RunResult = { changes: number | bigint; lastInsertRowid: number | bigint }
export type Db = BaseSQLiteDatabase<'sync', RunResult, typeof schema>

type SqlParam = null | number | bigint | string | NodeJS.ArrayBufferView

/** node:sqlite rejects undefined and booleans; better-sqlite3 callers expect leniency. */
function normalize(params: unknown[]): SqlParam[] {
  return params.map(p => {
    if (p === undefined) return null
    if (typeof p === 'boolean') return p ? 1 : 0
    return p as SqlParam
  })
}

class StatementShim {
  private rawStmt: ReturnType<DatabaseSync['prepare']> | null = null
  constructor(private readonly db: DatabaseSync, private readonly sql: string,
              private readonly stmt: ReturnType<DatabaseSync['prepare']>) {}

  run(...params: unknown[]): RunResult {
    return this.stmt.run(...normalize(params)) as RunResult
  }
  all(...params: unknown[]): unknown[] {
    return this.stmt.all(...normalize(params))
  }
  get(...params: unknown[]): unknown {
    return this.stmt.get(...normalize(params))
  }
  /** Array-mode view (rows as arrays) — used by Drizzle for column-mapped selects. */
  raw(): { all: (...p: unknown[]) => unknown[][]; get: (...p: unknown[]) => unknown[] | undefined } {
    if (!this.rawStmt) {
      this.rawStmt = this.db.prepare(this.sql)
      this.rawStmt.setReturnArrays(true)
    }
    const s = this.rawStmt
    return {
      all: (...p) => s.all(...normalize(p)) as unknown as unknown[][],
      get: (...p) => s.get(...normalize(p)) as unknown as unknown[] | undefined,
    }
  }
}

let savepointCounter = 0

type TxFn<A extends unknown[], R> = (...args: A) => R
type TxWrapper<A extends unknown[], R> = TxFn<A, R> & {
  deferred: TxFn<A, R>
  immediate: TxFn<A, R>
  exclusive: TxFn<A, R>
}

class ClientShim {
  constructor(readonly raw: DatabaseSync) {}

  prepare(sql: string): StatementShim {
    return new StatementShim(this.raw, sql, this.raw.prepare(sql))
  }

  exec(sql: string): void {
    this.raw.exec(sql)
  }

  /** better-sqlite3-style: transaction(fn) -> callable with behaviour variants. */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): TxWrapper<A, R> {
    const make = (begin: string): TxFn<A, R> => (...args: A): R => {
      // Already inside a transaction -> nested call becomes a savepoint.
      if (this.raw.isTransaction) {
        const sp = `fc_sp_${++savepointCounter}`
        this.raw.exec(`SAVEPOINT ${sp}`)
        try {
          const r = fn(...args)
          this.raw.exec(`RELEASE ${sp}`)
          return r
        } catch (err) {
          this.raw.exec(`ROLLBACK TO ${sp}`)
          this.raw.exec(`RELEASE ${sp}`)
          throw err
        }
      }
      this.raw.exec(begin)
      try {
        const r = fn(...args)
        this.raw.exec('COMMIT')
        return r
      } catch (err) {
        if (this.raw.isTransaction) {
          try { this.raw.exec('ROLLBACK') } catch { /* keep original error */ }
        }
        throw err
      }
    }
    const wrapper = make('BEGIN') as TxWrapper<A, R>
    wrapper.deferred = wrapper
    wrapper.immediate = make('BEGIN IMMEDIATE')
    wrapper.exclusive = make('BEGIN EXCLUSIVE')
    return wrapper
  }
}

/** Wrap an open `DatabaseSync` with Drizzle. The caller owns open/close/PRAGMAs. */
export function createDrizzle(raw: DatabaseSync): Db {
  const dialect = new SQLiteSyncDialect()
  const tablesConfig = extractTablesRelationalConfig(schema, createTableRelationsHelpers)
  const schemaCfg = {
    fullSchema: schema,
    schema: tablesConfig.tables,
    tableNamesMap: tablesConfig.tableNamesMap,
  }
  const client = new ClientShim(raw)
  // BetterSQLiteSession's constructor type wants a better-sqlite3 Database; our shim has the used subset.
  const session = new BetterSQLiteSession(client as never, dialect, schemaCfg, {})
  const db = new BaseSQLiteDatabase('sync', dialect, session, schemaCfg) as unknown as Db
  ;(db as unknown as { $client: unknown }).$client = raw
  return db
}
