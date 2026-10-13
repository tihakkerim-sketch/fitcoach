import { app } from 'electron'
import { IPC } from '../../src/types/ipc'
import { handle } from './handle'
import { checkForUpdates, getUpdateStatus, installUpdate } from '../updater'

export function registerUpdateHandlers() {
  handle(IPC.APP_INFO, () => ({ version: app.getVersion(), isPackaged: app.isPackaged }))
  handle(IPC.UPDATE_STATUS, () => getUpdateStatus())
  handle(IPC.UPDATE_CHECK, () => checkForUpdates())
  handle(IPC.UPDATE_INSTALL, () => installUpdate())
}
