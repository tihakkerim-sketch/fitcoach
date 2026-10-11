import { IPC } from '../../src/types/ipc'
import { handle } from './handle'
import { parseFitFile, parseTcxFile } from '../lib/garminParse'

export function registerGarminHandlers() {
  handle(IPC.GARMIN_PARSE, async (payload) => {
    const buffer = Buffer.from(payload.data)
    const ext    = payload.fileName.toLowerCase().split('.').pop()

    try {
      return ext === 'tcx'
        ? await parseTcxFile(buffer)
        : await parseFitFile(buffer)
    } catch (err) {
      throw new Error(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
}
