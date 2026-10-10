import { describe, it, expect } from 'vitest'
import { activities } from '../../db/schema'
import { runInTransaction } from './transaction'
import { makeTestDb } from './testDb'

const row = (date: string) => ({ type: 'running', date, createdAt: 1, source: 'manual' as const })

describe('runInTransaction', () => {
  it('commits and returns the callback result', async () => {
    const db = await makeTestDb()
    const out = runInTransaction(db, () => {
      db.insert(activities).values(row('2026-01-01')).run()
      return 42
    })
    expect(out).toBe(42)
    expect(db.select().from(activities).all()).toHaveLength(1)
  })

  it('rolls back every write and rethrows on error', async () => {
    const db = await makeTestDb()
    db.insert(activities).values(row('2026-01-01')).run()
    expect(() =>
      runInTransaction(db, () => {
        db.insert(activities).values(row('2026-01-02')).run()
        db.delete(activities).run()
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(db.select().from(activities).all()).toHaveLength(1)
  })

  it('rolls back when a statement fails midway (NOT NULL violation)', async () => {
    const db = await makeTestDb()
    db.insert(activities).values(row('2026-01-01')).run()
    expect(() =>
      runInTransaction(db, () => {
        db.delete(activities).run()
        db.insert(activities).values({ ...row('2026-01-02'), type: null as never }).run()
      })
    ).toThrow()
    const rows = db.select().from(activities).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-01-01')
  })

  it('can be used again after a rollback', async () => {
    const db = await makeTestDb()
    expect(() => runInTransaction(db, () => { throw new Error('x') })).toThrow('x')
    runInTransaction(db, () => { db.insert(activities).values(row('2026-01-03')).run() })
    expect(db.select().from(activities).all()).toHaveLength(1)
  })
})
