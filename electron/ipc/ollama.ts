import { IPC } from '../../src/types/ipc'
import type { LocalCoachResult, OllamaSettings } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { getSetting, setSetting } from '../lib/appSettings'
import { appToday } from '../lib/today'
import { buildCoachReport } from '../lib/coachExport'
import { createOllamaClient } from '../lib/ollamaClient'
import { createOllamaJob } from '../lib/ollamaJob'
import { markStoredResultApplied, parseStoredLocalCoachResult } from '../lib/ollamaPrompt'
import { runInTransaction } from '../lib/transaction'

const K_ENABLED = 'ollama.enabled'
const K_URL = 'ollama.url'
const K_MODEL = 'ollama.model'
const K_LAST = 'ollama.lastResult'
const DEFAULT_URL = 'http://localhost:11434'
const DEFAULT_MODEL = 'qwen3:8b'

const job = createOllamaJob()

function readSettings(): OllamaSettings {
  const db = getDb()
  return {
    enabled: getSetting(db, K_ENABLED) === '1',
    url: getSetting(db, K_URL) || DEFAULT_URL,
    model: getSetting(db, K_MODEL) || DEFAULT_MODEL,
  }
}

function readLastResult(): LocalCoachResult | null {
  return parseStoredLocalCoachResult(getSetting(getDb(), K_LAST))
}

export function registerOllamaHandlers() {
  handle(IPC.OLLAMA_SETTINGS_GET, () => readSettings())

  handle(IPC.OLLAMA_SETTINGS_SET, ({ enabled, url, model }) => {
    const db = getDb()
    runInTransaction(db, () => {
      setSetting(db, K_ENABLED, enabled ? '1' : '0')
      setSetting(db, K_URL, url)
      setSetting(db, K_MODEL, model)
    })
  })

  handle(IPC.OLLAMA_TEST, async ({ url }) => {
    const models = await createOllamaClient({ baseUrl: url }).listModels()
    return { models: models.map(m => ({ name: m.name, sizeGb: Math.round((m.size / 1e9) * 10) / 10 })) }
  })

  handle(IPC.OLLAMA_START, (range) => {
    const s = readSettings()
    if (!s.enabled) throw new Error('Lokaler Coach ist ausgeschaltet')
    // Nicht awaiten: wirft synchron, wenn schon einer läuft; Fehler des Laufs landen im Status.
    void job.start({
      client: createOllamaClient({ baseUrl: s.url }),
      model: s.model,
      range,
      buildReport: () => buildCoachReport(getDb(), appToday(getDb()), range),
      saveResult: (r) => setSetting(getDb(), K_LAST, JSON.stringify(r)),
    })
  })

  handle(IPC.OLLAMA_STATUS, () => job.status())
  handle(IPC.OLLAMA_CANCEL, () => { job.cancel() })
  handle(IPC.OLLAMA_LAST_RESULT, () => readLastResult())
  handle(IPC.OLLAMA_MARK_APPLIED, () => {
    const db = getDb()
    runInTransaction(db, () => {
      const next = markStoredResultApplied(getSetting(db, K_LAST), new Date().toISOString())
      if (next) setSetting(db, K_LAST, next)
    })
  })
}
