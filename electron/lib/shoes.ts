/** Laufschuhe: Liste mit Laufleistung, Speichern (Standard-Schuh), Löschen. Ohne `electron`-Import. */
import { and, eq, ne, sql } from 'drizzle-orm'
import { activities, shoes } from '../../db/schema'
import type { Shoe, SaveShoePayload } from '../../src/types/ipc'
import { runInTransaction, type TxDb } from './transaction'

type ShoeRow = typeof shoes.$inferSelect

function toShoe(r: ShoeRow, runKm: number, runCount: number): Shoe {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand ?? undefined,
    startKm: r.startKm,
    maxKm: r.maxKm,
    retired: r.retired === 1,
    isDefault: r.isDefault === 1,
    totalKm: Math.round((r.startKm + runKm) * 10) / 10,
    runCount,
    createdAt: r.createdAt,
  }
}

function usage(db: TxDb, shoeId: number): { km: number; count: number } {
  const [u] = db
    .select({
      km: sql<number>`coalesce(sum(${activities.distanceKm}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(activities)
    .where(and(eq(activities.shoeId, shoeId), eq(activities.type, 'running')))
    .all()
  return { km: Number(u.km) || 0, count: Number(u.count) || 0 }
}

export function listShoes(db: TxDb): Shoe[] {
  return db.select().from(shoes).all()
    .map(r => { const u = usage(db, r.id); return toShoe(r, u.km, u.count) })
    .sort((a, b) =>
      Number(a.retired) - Number(b.retired) || Number(b.isDefault) - Number(a.isDefault) || a.id - b.id)
}

export function getDefaultShoeId(db: TxDb): number | null {
  const r = db.select({ id: shoes.id }).from(shoes)
    .where(and(eq(shoes.isDefault, 1), eq(shoes.retired, 0))).get()
  return r?.id ?? null
}

export function saveShoe(db: TxDb, p: SaveShoePayload, now: number = Date.now()): Shoe {
  return runInTransaction(db, () => {
    const values = {
      name: p.name.trim(),
      brand: p.brand?.trim() ? p.brand.trim() : null,
      startKm: p.startKm,
      maxKm: p.maxKm,
      retired: p.retired ? 1 : 0,
      // ausgemusterte Schuhe können nicht Standard sein
      isDefault: p.isDefault && !p.retired ? 1 : 0,
    }
    let id: number
    if (p.id !== undefined) {
      const res = db.update(shoes).set(values).where(eq(shoes.id, p.id)).run()
      if (Number(res.changes) === 0) throw new Error('Dieser Schuh existiert nicht mehr.')
      id = p.id
    } else {
      id = db.insert(shoes).values({ ...values, createdAt: now }).returning().all()[0].id
    }
    if (values.isDefault === 1) {
      db.update(shoes).set({ isDefault: 0 }).where(ne(shoes.id, id)).run()
    }
    const row = db.select().from(shoes).where(eq(shoes.id, id)).get()!
    const u = usage(db, id)
    return toShoe(row, u.km, u.count)
  })
}

/** Löscht den Schuh; Läufe behalten ihre Daten und verlieren nur die Schuh-Zuordnung (FK SET NULL). */
export function deleteShoe(db: TxDb, id: number): void {
  db.delete(shoes).where(eq(shoes.id, id)).run()
}
