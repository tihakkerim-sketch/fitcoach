import { app, ipcMain } from 'electron'
import { IPC } from '../../src/types/ipc'
import type { IpcResponse } from '../../src/types/ipc'

// OS-level app settings that live outside the database.
//
// Autostart is handled via Electron's login-item API, which on Windows writes
// an entry under HKCU\…\Run pointing at the app executable. This is the
// recommended approach over dropping a shortcut into the Startup folder: it is
// per-user, requires no admin rights, and is removed cleanly when toggled off.
//
// Note: in a packaged build the Run entry points at the installed FitCoach.exe.
// When running unpackaged (npm run dev) it points at the Electron binary, so
// the toggle is only fully meaningful once the app is installed from the
// produced executable.

export function registerSettingsHandlers() {
  ipcMain.handle(
    IPC.AUTOSTART_GET,
    async (): Promise<IpcResponse<boolean>> => {
      try {
        return { success: true, data: app.getLoginItemSettings().openAtLogin }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.AUTOSTART_SET,
    async (_e, enabled: unknown): Promise<IpcResponse<boolean>> => {
      try {
        app.setLoginItemSettings({ openAtLogin: Boolean(enabled) })
        // Read the value back so the renderer reflects the OS's actual state
        return { success: true, data: app.getLoginItemSettings().openAtLogin }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
