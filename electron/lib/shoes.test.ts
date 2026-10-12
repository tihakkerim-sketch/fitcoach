import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { activities } from '../../db/schema'
import { makeTestDb, type TestDb } from './testDb'
import { deleteShoe, getDefaultShoeId, listShoes, saveShoe } from './shoes'
import { insertActivity } from './activityInsert'

let db: TestDb
const base = { name: 'Pegasus', brand: 'Nike', startKm: 100, maxKm: 700, retired: false, isDefault: false }
const run = (over: Record<string, unknown> = {}) =>
  ({ type: 'running', date: '2026-10-10', source: 'manual', distanceKm: 10, ...over }) as never

beforeEach(async () => { db = await makeTestDb() })

describe('Schuhe', () => {
  it('speichert und listet mit Laufleistung (Start-km + nur Läufe)', () => {
    const s = saveShoe(db, base)
    expect(s).toMatchObject({ name: 'Pegasus', brand: 'Nike', totalKm: 100, runCount: 0, retired: false })
    insertActivity(db, run({ shoeId: s.id, distanceKm: 10.5 }))
    insertActivity(db, run({ shoeId: s.id, distanceKm: 5 }))
    insertActivity(db, run({ type: 'cycling', shoeId: s.id, distanceKm: 40 })) // zählt nicht
    const [listed] = listShoes(db)
    expect(listed.totalKm).toBe(115.5)
    expect(listed.runCount).toBe(2)
  })

  it('bearbeiten per id; unbekannte id → Fehler', () => {
    const s = saveShoe(db, base)
    expect(saveShoe(db, { ...base, id: s.id, name: 'Neu', brand: null, maxKm: 600 })).toMatchObject({ id: s.id, name: 'Neu', brand: undefined, maxKm: 600 })
    expect(() => saveShoe(db, { ...base, id: 999 })).toThrow(/existiert nicht/)
  })

  it('nur ein Standard-Schuh; ausgemusterter Schuh kann nicht Standard sein', () => {
    const a = saveShoe(db, { ...base, name: 'A', isDefault: true })
    const b = saveShoe(db, { ...base, name: 'B', isDefault: true })
    expect(listShoes(db).filter(s => s.isDefault).map(s => s.id)).toEqual([b.id])
    expect(getDefaultShoeId(db)).toBe(b.id)
    const retired = saveShoe(db, { ...base, id: b.id, name: 'B', retired: true, isDefault: true })
    expect(retired.isDefault).toBe(false)
    expect(getDefaultShoeId(db)).toBeNull()
    expect(a.id).not.toBe(b.id)
  })

  it('Löschen lässt Läufe bestehen (shoe_id → NULL)', () => {
    const s = saveShoe(db, base)
    const a = insertActivity(db, run({ shoeId: s.id }))
    deleteShoe(db, s.id)
    expect(listShoes(db)).toHaveLength(0)
    expect(db.select().from(activities).where(eq(activities.id, a.id)).get()?.shoeId).toBeNull()
  })

  describe('Standard-Schuh bei neuen Aktivitäten', () => {
    it('Lauf ohne shoeId bekommt den Standard-Schuh; Rad / null / ausdrückliche Wahl nicht', () => {
      const def = saveShoe(db, { ...base, isDefault: true })
      const other = saveShoe(db, { ...base, name: 'Zweit' })
      expect(insertActivity(db, run()).shoeId).toBe(def.id)
      expect(insertActivity(db, run({ shoeId: other.id })).shoeId).toBe(other.id)
      expect(insertActivity(db, run({ shoeId: null })).shoeId).toBeNull()
      expect(insertActivity(db, run({ type: 'cycling' })).shoeId).toBeNull()
    })
    it('ohne Standard-Schuh bleibt shoeId leer', () => {
      saveShoe(db, base)
      expect(insertActivity(db, run()).shoeId).toBeNull()
    })
  })
})
