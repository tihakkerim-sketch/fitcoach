import { ipcMain, dialog } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { IpcResponse } from '../../src/types/ipc'
import { getDb, markDirty } from '../../db/index'
import { activities, trainingPlans, planPhases, planWeeks, planSessions, userProfile, hrZones } from '../../db/schema'
import { importBackup } from '../lib/importBackup'
import * as fs from 'fs'

export function registerDataHandlers() {
  ipcMain.handle(
    IPC.DATA_EXPORT,
    async (): Promise<IpcResponse<string>> => {
      try {
        const db = getDb()
        const result = {
          exportedAt: new Date().toISOString(),
          version: 2,
          activities: db.select().from(activities).all(),
          trainingPlans: db.select().from(trainingPlans).all(),
          planPhases: db.select().from(planPhases).all(),
          planWeeks: db.select().from(planWeeks).all(),
          planSessions: db.select().from(planSessions).all(),
          userProfile: db.select().from(userProfile).all(),
          hrZones: db.select().from(hrZones).all(),
        }

        const { filePath, canceled } = await dialog.showSaveDialog({
          title: 'Export FitCoach Data',
          defaultPath: `fitcoach-backup-${new Date().toISOString().split('T')[0]}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })

        if (canceled || !filePath) return { success: false, error: 'Export cancelled' }

        fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8')
        return { success: true, data: filePath }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.DATA_IMPORT,
    async (): Promise<IpcResponse<void>> => {
      try {
        const { filePaths, canceled } = await dialog.showOpenDialog({
          title: 'Import FitCoach Backup',
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile'],
        })

        if (canceled || filePaths.length === 0) return { success: false, error: 'Import cancelled' }

        const raw = fs.readFileSync(filePaths[0], 'utf-8')

        let data: Record<string, unknown>
        try {
          data = JSON.parse(raw) as Record<string, unknown>
        } catch {
          return { success: false, error: 'File is not valid JSON — import cancelled, your data is unchanged' }
        }

        const result = importBackup(getDb(), data)
        if (!result.success) {
          return { success: false, error: result.error ?? 'Import failed' }
        }

        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
