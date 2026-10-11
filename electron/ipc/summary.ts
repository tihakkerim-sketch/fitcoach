import { dialog } from 'electron'
import * as fs from 'fs'
import { IPC } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { todayLocal } from '../../src/shared/planCalendar'
import { buildCoachReport } from '../lib/coachExport'

export function registerSummaryHandlers() {
  handle(IPC.EXPORT_GENERATE_SUMMARY, (payload) => buildCoachReport(getDb(), todayLocal(), payload))

  handle(IPC.EXPORT_SAVE_MD, async (payload) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Coach-Bericht speichern',
      defaultPath: payload.filename,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (canceled || !filePath) throw new Error('Cancelled')
    fs.writeFileSync(filePath, payload.content, 'utf-8')
    return filePath
  })
}
