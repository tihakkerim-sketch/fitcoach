import { IPC } from '../../src/types/ipc'
import type { LocalCoachResult, OllamaSettings } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { getSetting, setSetting, deleteSetting } from '../lib/appSettings'
import { appToday } from '../lib/today'
import { buildCoachReport } from '../lib/coachExport'
import { createOllamaClient } from '../lib/ollamaClient'
import { createOllamaJob } from '../lib/ollamaJob'
import { pickPreviousForFollowUp, markStoredResultApplied, parseStoredLocalCoachResult } from '../lib/ollamaPrompt'
import { parseStoredHistory, appendHistory, markHistoryApplied } from '../lib/ollamaHistory'
import { runInTransaction } from '../lib/transaction'

const K_ENABLED = 'ollama.enabled'
const K_URL = 'ollama.url'
const K_MODEL = 'ollama.model'
const K_LAST = 'ollama.lastResult'
const K_HISTORY = 'ollama.history'
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

  handle(IPC.OLLAMA_START, ({ message, followUp, ...range }) => {
    const s = readSettings()
    if (!s.enabled) throw new Error('Lokaler Coach ist ausgeschaltet')
    // Nachfrage: letzte gültige Antwort mitschicken (ohne passende gespeicherte Antwort normale Anfrage)
    const previous = followUp ? pickPreviousForFollowUp(readLastResult(), range) : undefined
    // Nicht awaiten: wirft synchron, wenn schon einer läuft; Fehler des Laufs landen im Status.
    void job.start({
      client: createOllamaClient({ baseUrl: s.url }),
      model: s.model,
      range,
      message,
      previous,
      buildReport: () => buildCoachReport(getDb(), appToday(getDb()), range),
      // Aktuelle Antwort und Verlauf zusammen speichern
      saveResult: (r) => {
        const db = getDb()
        runInTransaction(db, () => {
          setSetting(db, K_LAST, JSON.stringify(r))
          setSetting(db, K_HISTORY, JSON.stringify(appendHistory(parseStoredHistory(getSetting(db, K_HISTORY)), r)))
        })
      },
    })
  })

  handle(IPC.OLLAMA_STATUS, () => job.status())
  handle(IPC.OLLAMA_CANCEL, () => { job.cancel() })
  handle(IPC.OLLAMA_LAST_RESULT, () => readLastResult())
  handle(IPC.OLLAMA_MARK_APPLIED, () => {
    const db = getDb()
    runInTransaction(db, () => {
      const appliedAt = new Date().toISOString()
      const last = parseStoredLocalCoachResult(getSetting(db, K_LAST))
      const next = markStoredResultApplied(getSetting(db, K_LAST), appliedAt)
      if (next) setSetting(db, K_LAST, next)
      if (last) {
        const history = markHistoryApplied(parseStoredHistory(getSetting(db, K_HISTORY)), last.createdAt, appliedAt)
        setSetting(db, K_HISTORY, JSON.stringify(history))
      }
    })
  })
  handle(IPC.OLLAMA_HISTORY, () => parseStoredHistory(getSetting(getDb(), K_HISTORY)))
  handle(IPC.OLLAMA_HISTORY_CLEAR, () => { deleteSetting(getDb(), K_HISTORY) })
}
