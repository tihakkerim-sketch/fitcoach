import { test as base, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

interface IpcResponse<T> { success: boolean; data?: T; error?: string }

/** Ruft einen IPC-Kanal auf und packt `{success, data}` aus (wirft bei Fehler). */
export async function invoke<T = unknown>(page: Page, channel: string, payload?: unknown): Promise<T> {
  const res = await page.evaluate(
    ([c, p]) => (window as unknown as { fitcoach: { invoke: (c: string, p?: unknown) => Promise<unknown> } }).fitcoach.invoke(c as string, p),
    [channel, payload] as const,
  ) as IpcResponse<T>
  if (!res.success) throw new Error(`IPC ${channel} fehlgeschlagen: ${res.error}`)
  return res.data as T
}

/** Legt ein Profil an und schließt das Onboarding ab (damit /willkommen nicht dazwischenfunkt). */
export async function skipOnboarding(page: Page, profile: Record<string, unknown> = {}): Promise<void> {
  await invoke(page, 'profile:save', { name: 'Testlauf', maxHr: 190, restingHr: 55, dayStartHour: 4, ...profile })
  await invoke(page, 'onboarding:complete')
  await page.evaluate(() => { location.hash = '#/' })
  await page.reload()
}

interface Fixtures {
  app: ElectronApplication
  page: Page
  consoleErrors: string[]
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, use) => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fitcoach-e2e-'))
    const app = await _electron.launch({
      args: ['.', `--user-data-dir=${userData}`],
      env: { ...process.env, FITCOACH_LOAD_DIST: '1' } as Record<string, string>,
    })
    await use(app)
    await app.close().catch(() => {})
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  },
  consoleErrors: async ({}, use) => { // eslint-disable-line no-empty-pattern
    await use([])
  },
  page: async ({ app, consoleErrors }, use) => {
    const page = await app.firstWindow()
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`) })
    page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`))
    await page.waitForLoadState('domcontentloaded')
    await use(page)
    expect(consoleErrors, 'Konsolenfehler im Renderer').toEqual([])
  },
})

export { expect }
