import { app, BrowserWindow, dialog, shell, session } from 'electron'
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
import { registerSettingsHandlers } from './ipc/settings'

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
      sandbox: true,
    },
    titleBarStyle: 'default',
    show: false,
  })

  // ── Navigation hardening ──────────────────────────────────────────────────
  // The renderer should never navigate away from the app or spawn new windows.
  // Any external link is handed to the OS browser instead; everything else is
  // blocked. In dev, allow the Vite dev-server origin so HMR still works.
  const allowedOrigin = isDev ? 'http://localhost:5173' : null

  win.webContents.on('will-navigate', (event, url) => {
    if (allowedOrigin && url.startsWith(allowedOrigin)) return
    event.preventDefault()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    // main.js lives at dist-electron/electron/ inside the asar; the renderer
    // bundle is at dist/ (project root). Go up two levels, not one.
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
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
  // ── Content-Security-Policy (production only) ────────────────────────────────
  // Defense-in-depth: the renderer may only load its own bundled assets. Set via
  // response headers rather than a <meta> tag so dev (Vite HMR with inline scripts
  // and a websocket) is left untouched. 'unsafe-inline' for styles is required by
  // shadcn/Tailwind's injected styles and is safe for a local-only app.
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'",
          ],
        },
      })
    })
  }

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
  registerSettingsHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => closeDb())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
