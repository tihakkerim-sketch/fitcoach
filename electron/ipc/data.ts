import { dialog } from 'electron'
import { IPC } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { importBackup } from '../lib/importBackup'
import { exportBackup } from '../lib/backupFormat'
import { format } from 'date-fns'
import * as fs from 'fs'

// A real backup is a few MB at most; refuse anything absurd before reading it into memory
const MAX_BACKUP_BYTES = 200 * 1024 * 1024

export function registerDataHandlers() {
  handle(IPC.DATA_EXPORT, async () => {
    // Full v3 backup: every table (see electron/lib/backupFormat.ts)
    const result = exportBackup(getDb())

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export FitCoach Data',
      defaultPath: `fitcoach-backup-${format(new Date(), 'yyyy-MM-dd')}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    if (canceled || !filePath) throw new Error('Export cancelled')

    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8')
    return filePath
  })

  handle(IPC.DATA_IMPORT, async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Import FitCoach Backup',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })

    if (canceled || filePaths.length === 0) throw new Error('Import cancelled')

    if (fs.statSync(filePaths[0]).size > MAX_BACKUP_BYTES) {
      throw new Error('Backup file is too large — import cancelled, your data is unchanged')
    }
    const raw = fs.readFileSync(filePaths[0], 'utf-8')

    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw) as Record<string, unknown>
    } catch {
      throw new Error('File is not valid JSON — import cancelled, your data is unchanged')
    }

    const result = importBackup(getDb(), data)
    if (!result.success) {
      throw new Error(result.error ?? 'Import failed')
    }
  })
}
