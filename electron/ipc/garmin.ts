import { ipcMain } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { IpcResponse, CreateActivityPayload } from '../../src/types/ipc'
import { parseFitFile, parseTcxFile } from '../lib/garminParse'

interface GarminParsePayload {
  fileName: string
  data: Uint8Array | number[]
}

export function registerGarminHandlers() {
  ipcMain.handle(
    IPC.GARMIN_PARSE,
    async (_e, payload: GarminParsePayload): Promise<IpcResponse<Partial<CreateActivityPayload>>> => {
      try {
        const buffer = Buffer.from(payload.data)
        const ext    = payload.fileName.toLowerCase().split('.').pop()

        const parsed = ext === 'tcx'
          ? await parseTcxFile(buffer)
          : await parseFitFile(buffer)

        return { success: true, data: parsed }
      } catch (err) {
        return { success: false, error: `Failed to parse file: ${String(err)}` }
      }
    }
  )
}
