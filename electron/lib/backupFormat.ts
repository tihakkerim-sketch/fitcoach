/**
 * Shared description of the JSON backup format — free of `electron` imports.
 *
 *   v1 / v2: activities, plans (phases/weeks/sessions), userProfile, hrZones
 *   v3     : v2 + habits, habitLogs, dailyCheckins, recoveryLogs, nutritionLogs,
 *            bodyMetrics, challengePool, dailyChallenges
 *   v4     : userProfile, hrZones, activities, plans, dailyCheckins, recoveryLogs
 *            (modules removed in Phase 1; their keys in v3 files are ignored on import)
 *   v5     : wie v4, aber Plan-Modell v2: trainingPlans (mit startDate), planWeeks (planId/weekIndex),
 *            planSessions (neue Spalten); kein planPhases. Dateien v1–v4 mit Phasen-Plänen werden
 *            beim Import per convertLegacyPlans umgewandelt.
 *   v6     : v5 + activitySplits, activityStreams (und neue Spalten an activities/recoveryLogs).
 *            `app_settings` (API-Schlüssel) wird NIE exportiert und beim Import nie angefasst.
 */
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { TxDb } from './transaction'
import {
  activities, activitySplits, activityStreams, trainingPlans, planWeeks, planSessions,
  userProfile, hrZones, dailyCheckins, recoveryLogs,
} from '../../db/schema'

export const BACKUP_VERSION = 6

export interface BackupTable {
  key: string
  table: SQLiteTable
  /** true = part of the original v1/v2 format */
  legacy: boolean
  /** first backup version that contains this table (default 0); older files may omit it */
  since?: number
}

// Foreign-key-safe INSERT order: parents before children.
// DELETE order is the reverse of this list (children before parents).
export const BACKUP_TABLES: readonly BackupTable[] = [
  { key: 'userProfile',     table: userProfile,     legacy: true  },
  { key: 'hrZones',         table: hrZones,         legacy: true  },
  { key: 'activities',      table: activities,      legacy: true  },
  { key: 'activitySplits',  table: activitySplits,  legacy: false, since: 6 },
  { key: 'activityStreams', table: activityStreams, legacy: false, since: 6 },
  { key: 'trainingPlans',   table: trainingPlans,   legacy: true  },
  { key: 'planWeeks',       table: planWeeks,       legacy: true  },
  { key: 'planSessions',    table: planSessions,    legacy: true  },
  { key: 'dailyCheckins',   table: dailyCheckins,   legacy: false },
  { key: 'recoveryLogs',    table: recoveryLogs,    legacy: false },
]

/** Build the full v6 backup object (all tables) from the database. */
export function exportBackup(db: TxDb): Record<string, unknown> {
  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    version: BACKUP_VERSION,
  }
  for (const { key, table } of BACKUP_TABLES) {
    out[key] = db.select().from(table).all()
  }
  return out
}
