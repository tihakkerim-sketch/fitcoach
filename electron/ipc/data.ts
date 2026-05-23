import { ipcMain, dialog } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { IpcResponse } from '../../src/types/ipc'
import { getDb, markDirty } from '../../db/index'
import { activities, trainingPlans, planPhases, planWeeks, planSessions, userProfile, hrZones } from '../../db/schema'
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
        const data = JSON.parse(raw) as Record<string, unknown>

        // Accept both v1 (pre-Phase 2, had coach tables) and v2 backups
        const version = data.version as number
        if (!version || (version !== 1 && version !== 2)) {
          return { success: false, error: 'Unrecognised backup format or version' }
        }

        const db = getDb()

        // Clear existing data in dependency order
        db.delete(planSessions).run()
        db.delete(planWeeks).run()
        db.delete(planPhases).run()
        db.delete(trainingPlans).run()
        db.delete(activities).run()
        db.delete(hrZones).run()
        db.delete(userProfile).run()

        // Re-insert
        if (Array.isArray(data.userProfile) && data.userProfile.length)
          db.insert(userProfile).values(data.userProfile as never[]).run()
        if (Array.isArray(data.hrZones) && data.hrZones.length)
          db.insert(hrZones).values(data.hrZones as never[]).run()
        if (Array.isArray(data.activities) && data.activities.length)
          db.insert(activities).values(data.activities as never[]).run()
        if (Array.isArray(data.trainingPlans) && data.trainingPlans.length)
          db.insert(trainingPlans).values(data.trainingPlans as never[]).run()
        if (Array.isArray(data.planPhases) && data.planPhases.length)
          db.insert(planPhases).values(data.planPhases as never[]).run()
        if (Array.isArray(data.planWeeks) && data.planWeeks.length)
          db.insert(planWeeks).values(data.planWeeks as never[]).run()
        if (Array.isArray(data.planSessions) && data.planSessions.length)
          db.insert(planSessions).values(data.planSessions as never[]).run()
        // v1 backups may contain coachConversations / coachMessages — silently ignored

        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
