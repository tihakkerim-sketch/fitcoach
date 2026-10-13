import { app, BrowserWindow, dialog, shell, session } from 'electron'
import * as path from 'path'
import { initDb, closeDb } from '../db/index'
import { registerActivityHandlers } from './ipc/activities'
import { registerPlanHandlers } from './ipc/plans'
import { registerProfileHandlers } from './ipc/profile'
import { registerGarminHandlers } from './ipc/garmin'
import { registerIntervalsHandlers } from './ipc/intervals'
import { registerDataHandlers } from './ipc/data'
import { registerSummaryHandlers } from './ipc/summary'
import { registerCoachHandlers } from './ipc/coach'
import { registerStatsHandlers } from './ipc/stats'
import { registerCheckinHandlers } from './ipc/checkin'
import { registerRecoveryHandlers } from './ipc/recovery'
import { registerSettingsHandlers } from './ipc/settings'
import { registerShoeHandlers } from './ipc/shoes'
import { registerUpdateHandlers } from './ipc/update'
import { initUpdater } from './updater'

// FITCOACH_LOAD_DIST=1: unpackaged app loads the built renderer (dist/) with the
// production CSP – used by the E2E tests so they need no Vite server.
const isDev =
  process.env.FITCOACH_LOAD_DIST !== '1' &&
  (process.env.NODE_ENV === 'development' || !app.isPackaged)

// Kept so a second launch can focus the existing window
let mainWindow: BrowserWindow | null = null

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
  } else {
    // main.js lives at dist-electron/electron/ inside the asar; the renderer
    // bundle is at dist/ (project root). Go up two levels, not one.
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  win.once('ready-to-show', () => win.show())

  // Windows logoff / shutdown: Electron may not emit before-quit, so flush the
  // in-memory database to disk right away.
  win.on('session-end', () => closeDb())

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
}

// ── Single instance ──────────────────────────────────────────────────────────
// Two instances would each hold the whole DB in memory and overwrite each
// other's file → data loss. The second launch just focuses the first window.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  startApp()
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
  dialog.showErrorBox(
    'Unexpected Error',
    `An unexpected error occurred:\n${String(reason)}\n\nThe app will continue running.`
  )
})

function startApp() {
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
    registerIntervalsHandlers()
    registerDataHandlers()
    registerSummaryHandlers()
    registerCoachHandlers()
    registerStatsHandlers()
    registerCheckinHandlers()
    registerRecoveryHandlers()
    registerSettingsHandlers()
    registerShoeHandlers()
    registerUpdateHandlers()

    createWindow()
    initUpdater()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('before-quit', () => closeDb())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
