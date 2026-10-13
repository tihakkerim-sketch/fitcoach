import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../src/types/ipc'
import {
  disabledUpdateStatus, initialUpdateStatus, reduceUpdateStatus, type UpdateEvent,
} from './lib/updateStatus'

let status: UpdateStatus = app.isPackaged ? initialUpdateStatus : disabledUpdateStatus
let started = false

function dispatch(event: UpdateEvent) {
  status = reduceUpdateStatus(status, event)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

/** Startet die Prüfung; Fehler landen im Status (nicht als Dialog). */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return disabledUpdateStatus
  if (status.state === 'checking' || status.state === 'downloading') return status
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    // Das Fehler-Event hat den Status meist schon gesetzt; sicherheitshalber nochmal
    if (status.state !== 'error') dispatch({ type: 'error', error: err })
    console.warn('[updater] Prüfung fehlgeschlagen:', err)
  }
  return status
}

export function installUpdate(): UpdateStatus {
  if (status.state === 'downloaded') autoUpdater.quitAndInstall()
  return status
}

async function askRestart(version: string) {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Update bereit',
    message: `Update ${version} ist bereit. Jetzt neu starten?`,
    buttons: ['Jetzt neu starten', 'Später'],
    defaultId: 0,
    cancelId: 1,
  })
  if (response === 0) autoUpdater.quitAndInstall()
}

/** Nach createWindow() aufrufen. Nur in der installierten App aktiv. */
export function initUpdater() {
  if (!app.isPackaged || started) return
  started = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => dispatch({ type: 'checking' }))
  autoUpdater.on('update-available', (info) => dispatch({ type: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => dispatch({ type: 'not-available' }))
  autoUpdater.on('download-progress', (p) => dispatch({ type: 'progress', percent: p.percent }))
  autoUpdater.on('update-downloaded', (info) => {
    dispatch({ type: 'downloaded', version: info.version })
    askRestart(info.version).catch((e) => console.warn('[updater] Dialog:', e))
  })
  autoUpdater.on('error', (err) => {
    dispatch({ type: 'error', error: err })
    console.warn('[updater] Fehler:', err)
  })

  // Start-Check 10 s nach Fensterstart (offline ist normal, nur loggen)
  setTimeout(() => { checkForUpdates().catch(() => {}) }, 10_000)
}
