import { app, BrowserWindow, dialog } from 'electron'
import * as path from 'path'
import { initDb, closeDb } from '../db/index'
import { registerActivityHandlers } from './ipc/activities'
import { registerPlanHandlers } from './ipc/plans'
import { registerProfileHandlers } from './ipc/profile'
import { registerGarminHandlers } from './ipc/garmin'
import { registerDataHandlers } from './ipc/data'
import { registerSummaryHandlers } from './ipc/summary'
import { registerStatsHandlers } from './ipc/stats'
import { registerHabitHandlers } from './ipc/habits'
import { registerCheckinHandlers } from './ipc/checkin'
import { registerBodyHandlers } from './ipc/body'
import { registerNutritionHandlers } from './ipc/nutrition'
import { registerRecoveryHandlers } from './ipc/recovery'
import { registerChallengeHandlers } from './ipc/challenges'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'default',
    show: false,
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.once('ready-to-show', () => win.show())
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
  dialog.showErrorBox(
    'Unexpected Error',
    `An unexpected error occurred:\n${String(reason)}\n\nThe app will continue running.`
  )
})

app.whenReady().then(async () => {
  try {
    await initDb()
  } catch (err) {
    dialog.showErrorBox(
      'Database Error',
      `Failed to initialize database:\n${String(err)}\n\nThe app cannot start.`
    )
    app.quit()
    return
  }

  registerActivityHandlers()
  registerPlanHandlers()
  registerProfileHandlers()
  registerGarminHandlers()
  registerDataHandlers()
  registerSummaryHandlers()
  registerStatsHandlers()
  registerHabitHandlers()
  registerCheckinHandlers()
  registerBodyHandlers()
  registerNutritionHandlers()
  registerRecoveryHandlers()
  registerChallengeHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => closeDb())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
