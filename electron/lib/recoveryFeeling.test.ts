import { describe, it, expect } from 'vitest'
import { recoveryLogs } from '../../db/schema'
import { makeTestDb } from './testDb'
import { setFeeling } from './recoveryFeeling'

describe('setFeeling', () => {
  it('legt eine manuelle Zeile an und ändert danach nur feeling', async () => {
    const db = await makeTestDb()
    const a = setFeeling(db, '2026-10-12', 4, 100)
    expect(a).toMatchObject({ feeling: 4, source: 'manual', createdAt: 100 })
    db.update(recoveryLogs).set({ hrvRmssd: 55, note: 'x', source: 'intervals_icu' }).run()
    const b = setFeeling(db, '2026-10-12', 2, 200)
    expect(b).toMatchObject({ feeling: 2, hrvRmssd: 55, note: 'x', source: 'intervals_icu', updatedAt: 200 })
    expect(setFeeling(db, '2026-10-12', null).feeling).toBeNull()
    expect(db.select().from(recoveryLogs).all()).toHaveLength(1)
  })
})
