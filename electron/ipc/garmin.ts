import { IPC } from '../../src/types/ipc'
import type { ImportFileResult } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { parseGarminFile } from '../lib/garminParse'
import { saveImported } from '../lib/importActivity'

export function registerGarminHandlers() {
  // Jede Datei einzeln: ein Fehler bricht die anderen nicht ab
  handle(IPC.GARMIN_IMPORT_FILES, async ({ files }) => {
    const db = getDb()
    const results: ImportFileResult[] = []
    for (const file of files) {
      try {
        const parsed = await parseGarminFile(file.fileName, Buffer.from(file.data))
        const saved = saveImported(db, parsed, { fileName: file.fileName, source: 'garmin_import' })
        results.push({ fileName: file.fileName, status: saved.status, activityId: saved.activityId })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        results.push({ fileName: file.fileName, status: 'error', message: `Datei konnte nicht gelesen werden: ${reason}` })
      }
    }
    return results
  })
}
