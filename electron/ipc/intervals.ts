import { safeStorage } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { IntervalsStatus, SyncResult } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { deleteSetting, getSetting, setSetting } from '../lib/appSettings'
import { createIntervalsClient } from '../lib/intervalsClient'
import { runIntervalsSyncShared } from '../lib/intervalsSync'

const KEY_SETTING = 'intervals.apiKey'
const LAST_SYNC = 'intervals.lastSyncAt'
const LAST_RESULT = 'intervals.lastResult'

/** Entschlüsselter Schlüssel oder null (nicht verbunden / nicht lesbar). Nie loggen oder zurückgeben. */
function readApiKey(): string | null {
  const stored = getSetting(getDb(), KEY_SETTING)
  if (!stored || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return null
  }
}

function parseLastResult(raw: string | null): SyncResult | undefined {
  if (!raw) return undefined
  try { return JSON.parse(raw) as SyncResult } catch { return undefined }
}

export function registerIntervalsHandlers() {
  handle(IPC.INTERVALS_STATUS, (): IntervalsStatus => {
    const db = getDb()
    const lastSync = Number(getSetting(db, LAST_SYNC))
    return {
      configured: getSetting(db, KEY_SETTING) !== null,
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      lastSyncAt: Number.isFinite(lastSync) && lastSync > 0 ? lastSync : undefined,
      lastResult: parseLastResult(getSetting(db, LAST_RESULT)),
    }
  })

  handle(IPC.INTERVALS_SET_KEY, async ({ apiKey }) => {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Sichere Speicherung ist auf diesem Gerät nicht verfügbar – der Schlüssel wird nicht gespeichert.')
    }
    const athlete = await createIntervalsClient({ apiKey }).getAthlete() // wirft bei ungültigem Schlüssel
    const db = getDb()
    setSetting(db, KEY_SETTING, safeStorage.encryptString(apiKey).toString('base64'))
    deleteSetting(db, LAST_SYNC)
    deleteSetting(db, LAST_RESULT)
    return { athleteName: athlete.name ?? undefined }
  })

  handle(IPC.INTERVALS_CLEAR_KEY, () => {
    const db = getDb()
    deleteSetting(db, KEY_SETTING)
    deleteSetting(db, LAST_SYNC)
    deleteSetting(db, LAST_RESULT)
  })

  handle(IPC.INTERVALS_SYNC, async () => {
    const apiKey = readApiKey()
    if (!apiKey) throw new Error('intervals.icu ist nicht verbunden')
    const db = getDb()
    const last = Number(getSetting(db, LAST_SYNC))
    const result = await runIntervalsSyncShared(db, createIntervalsClient({ apiKey }), {
      now: new Date(),
      lastSyncAt: Number.isFinite(last) && last > 0 ? last : undefined,
    })
    setSetting(db, LAST_SYNC, String(result.at))
    setSetting(db, LAST_RESULT, JSON.stringify(result))
    return result
  })
}
