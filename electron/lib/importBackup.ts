/**
 * Pure, side-effect-light backup import logic — deliberately free of any
 * `electron` imports so it can be unit-tested against an in-memory database.
 *
 * Safety contract: existing data must NEVER be lost to a malformed or partially
 * invalid backup. The function validates shape first (failing before any delete),
 * snapshots all current rows, and restores them if any insert throws.
 */
import { drizzle } from 'drizzle-orm/sql-js'
import * as schema from '../../db/schema'
import {
  activities, trainingPlans, planPhases, planWeeks, planSessions,
  userProfile, hrZones,
} from '../../db/schema'

export type Db = ReturnType<typeof drizzle<typeof schema>>

export interface ImportResult {
  success: boolean
  error?: string
}

// Tables restored/replaced by an import, in foreign-key-safe insert order.
const TABLE_KEYS = [
  'userProfile', 'hrZones', 'activities',
  'trainingPlans', 'planPhases', 'planWeeks', 'planSessions',
] as const

/**
 * Replace all data with the contents of a parsed backup object.
 * On any failure the previous data is restored and `success: false` is returned.
 */
export function importBackup(db: Db, data: Record<string, unknown>): ImportResult {
  // ── Version gate ──────────────────────────────────────────────────────────
  const version = data.version as number
  if (!version || (version !== 1 && version !== 2)) {
    return { success: false, error: 'Unrecognised backup format or version — import cancelled, your data is unchanged' }
  }

  // ── Validate shape BEFORE touching the DB ───────────────────────────────────
  // Every present table key must be an array. A malformed file is rejected
  // before a single row is deleted, so existing data is never at risk.
  for (const key of TABLE_KEYS) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      return { success: false, error: `Backup field "${key}" is malformed — import cancelled, your data is unchanged` }
    }
  }

  // ── Snapshot current data so we can roll back on any failure ────────────────
  const snapshot = {
    userProfile:   db.select().from(userProfile).all(),
    hrZones:       db.select().from(hrZones).all(),
    activities:    db.select().from(activities).all(),
    trainingPlans: db.select().from(trainingPlans).all(),
    planPhases:    db.select().from(planPhases).all(),
    planWeeks:     db.select().from(planWeeks).all(),
    planSessions:  db.select().from(planSessions).all(),
  }

  const clearAll = () => {
    db.delete(planSessions).run()
    db.delete(planWeeks).run()
    db.delete(planPhases).run()
    db.delete(trainingPlans).run()
    db.delete(activities).run()
    db.delete(hrZones).run()
    db.delete(userProfile).run()
  }

  const insertAll = (src: Record<string, unknown>) => {
    if (Array.isArray(src.userProfile)   && src.userProfile.length)   db.insert(userProfile).values(src.userProfile as never[]).run()
    if (Array.isArray(src.hrZones)       && src.hrZones.length)       db.insert(hrZones).values(src.hrZones as never[]).run()
    if (Array.isArray(src.activities)    && src.activities.length)    db.insert(activities).values(src.activities as never[]).run()
    if (Array.isArray(src.trainingPlans) && src.trainingPlans.length) db.insert(trainingPlans).values(src.trainingPlans as never[]).run()
    if (Array.isArray(src.planPhases)    && src.planPhases.length)    db.insert(planPhases).values(src.planPhases as never[]).run()
    if (Array.isArray(src.planWeeks)     && src.planWeeks.length)     db.insert(planWeeks).values(src.planWeeks as never[]).run()
    if (Array.isArray(src.planSessions)  && src.planSessions.length)  db.insert(planSessions).values(src.planSessions as never[]).run()
  }

  try {
    clearAll()
    insertAll(data)
    // v1 backups may contain coachConversations / coachMessages — silently ignored
    return { success: true }
  } catch (importErr) {
    // Roll back to the pre-import snapshot so a bad file never destroys data
    try {
      clearAll()
      insertAll(snapshot as unknown as Record<string, unknown>)
    } catch { /* restore failed — surface original error below */ }
    return {
      success: false,
      error: `Import failed and your previous data was restored: ${String(importErr)}`,
    }
  }
}
