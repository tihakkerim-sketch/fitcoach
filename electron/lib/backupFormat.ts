/**
 * Shared description of the JSON backup format — free of `electron` imports.
 *
 *   v1 / v2: activities, plans (phases/weeks/sessions), userProfile, hrZones
 *   v3     : v2 + habits, habitLogs, dailyCheckins, recoveryLogs, nutritionLogs,
 *            bodyMetrics, challengePool, dailyChallenges
 */
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { TxDb } from './transaction'
import {
  activities, trainingPlans, planPhases, planWeeks, planSessions,
  userProfile, hrZones, habits, habitLogs, dailyCheckins, recoveryLogs,
  nutritionLogs, bodyMetrics, challengePool, dailyChallenges,
} from '../../db/schema'

export const BACKUP_VERSION = 3

export interface BackupTable {
  key: string
  table: SQLiteTable
  /** true = part of the original v1/v2 format */
  legacy: boolean
}

// Foreign-key-safe INSERT order: parents before children.
// DELETE order is the reverse of this list (children before parents).
export const BACKUP_TABLES: readonly BackupTable[] = [
  { key: 'userProfile',     table: userProfile,     legacy: true  },
  { key: 'hrZones',         table: hrZones,         legacy: true  },
  { key: 'activities',      table: activities,      legacy: true  },
  { key: 'trainingPlans',   table: trainingPlans,   legacy: true  },
  { key: 'planPhases',      table: planPhases,      legacy: true  },
  { key: 'planWeeks',       table: planWeeks,       legacy: true  },
  { key: 'planSessions',    table: planSessions,    legacy: true  },
  { key: 'habits',          table: habits,          legacy: false },
  { key: 'habitLogs',       table: habitLogs,       legacy: false },
  { key: 'dailyCheckins',   table: dailyCheckins,   legacy: false },
  { key: 'recoveryLogs',    table: recoveryLogs,    legacy: false },
  { key: 'nutritionLogs',   table: nutritionLogs,   legacy: false },
  { key: 'bodyMetrics',     table: bodyMetrics,     legacy: false },
  { key: 'challengePool',   table: challengePool,   legacy: false },
  { key: 'dailyChallenges', table: dailyChallenges, legacy: false },
]

/** Build the full v3 backup object (all tables) from the database. */
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
