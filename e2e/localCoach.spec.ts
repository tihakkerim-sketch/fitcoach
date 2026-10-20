import type { Page } from '@playwright/test'
import { test, expect, invoke, skipOnboarding } from './fixtures'
import { startFakeOllama, type FakeOllama } from './fakeOllama'
import { addDaysStr, mondayOf, todayLocal } from '../src/shared/planCalendar'

interface PlanDetail { weeks: { sessions: { id: number; title: string | null; targetDistanceKm: number | null }[] }[] }

/** Plan mit einer Einheit in der Zukunft (Woche +2, Mittwoch) anlegen und aktivieren. */
async function createPlan(page: Page) {
  const start = mondayOf(addDaysStr(todayLocal(new Date(), 4), -7)) // Montag der Vorwoche
  const weeks = [{ sessions: [] as unknown[] }, { sessions: [] as unknown[] }, { sessions: [] as unknown[] }, { sessions: [] as unknown[] }]
  weeks[3].sessions.push({ dayOfWeek: 3, type: 'running', title: 'Langer Lauf', targetDistanceKm: 10, targetHrZone: 2 })
  const plan = await invoke<{ id: number }>(page, 'plans:create', { name: 'E2E-Lokal', startDate: start, weeks })
  await invoke(page, 'plans:activate', plan.id)
  const detail = await invoke<PlanDetail>(page, 'plans:get', plan.id)
  const session = detail.weeks.flatMap(w => w.sessions).find(s => s.title === 'Langer Lauf')!
  return { planId: plan.id, sessionId: session.id }
}

async function configureOllama(page: Page, url: string) {
  await page.getByRole('navigation').getByRole('link', { name: 'Einstellungen' }).click()
  const sec = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lokaler Coach (Ollama)' }) })
  await sec.getByRole('switch', { name: 'Lokalen Coach aktivieren' }).click()
  await sec.locator('#ollama-url').fill(url)
  await sec.getByRole('button', { name: 'Verbindung testen' }).click()
  await expect(sec.getByText('Verbunden. 1 Modell(e) gefunden.')).toBeVisible()
  await sec.locator('#ollama-model').selectOption('qwen3:8b')
  await sec.getByRole('button', { name: 'Speichern' }).click()
  await expect(sec.getByText('Gespeichert.')).toBeVisible()
}

function localSection(page: Page) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lokaler Coach', exact: true }) })
}

test.describe('Lokaler Coach (Fake-Ollama)', () => {
  let fake: FakeOllama
  test.beforeEach(async () => { fake = await startFakeOllama() })
  test.afterEach(async () => { await fake.close() })

  test('fragen → Erklärung → Vorschau → übernehmen', async ({ page }) => {
    await skipOnboarding(page)
    const { planId, sessionId } = await createPlan(page)
    fake.setAnswer(JSON.stringify({
      explanation: 'Der lange Lauf wird etwas kürzer, damit du dich erholst.',
      fitcoachChanges: {
        fitcoachChanges: 1,
        summary: 'Langen Lauf kürzen',
        changes: [{ action: 'update', sessionId, set: { distanceKm: 7 }, reason: 'Mehr Erholung' }],
      },
    }))

    await configureOllama(page, fake.url)
    await page.getByRole('navigation').getByRole('link', { name: 'Coach', exact: true }).click()

    const sec = localSection(page)
    await sec.getByRole('button', { name: 'Lokalen Coach fragen' }).click()
    await expect(sec.getByText('Der lange Lauf wird etwas kürzer, damit du dich erholst.')).toBeVisible({ timeout: 20_000 })

    expect(fake.chatCalls).toHaveLength(1)
    expect(fake.chatCalls[0].model).toBe('qwen3:8b')
    expect(JSON.stringify(fake.chatCalls[0].messages)).toContain(`#${sessionId}`)

    await sec.getByRole('button', { name: 'Übernehmen' }).click()
    await expect(sec.getByText('Änderungen übernommen am')).toBeVisible()

    const detail = await invoke<PlanDetail>(page, 'plans:get', planId)
    const s = detail.weeks.flatMap(w => w.sessions).find(x => x.id === sessionId)!
    expect(s.targetDistanceKm).toBe(7)

    // Wieder öffnen: dasselbe Ergebnis darf nicht erneut angewendet werden
    await page.getByRole('navigation').getByRole('link', { name: 'Einstellungen' }).click()
    await page.getByRole('navigation').getByRole('link', { name: 'Coach', exact: true }).click()
    const sec2 = localSection(page)
    await expect(sec2.getByText('Änderungen übernommen am')).toBeVisible()
    await expect(sec2.getByRole('button', { name: 'Übernehmen' })).toHaveCount(0)
  })

  test('kaputtes JSON → Fehlertext, nichts geändert', async ({ page }) => {
    await skipOnboarding(page)
    const { planId, sessionId } = await createPlan(page)
    fake.setAnswer('Das ist leider kein JSON, sondern nur Gerede.')

    await configureOllama(page, fake.url)
    await page.getByRole('navigation').getByRole('link', { name: 'Coach', exact: true }).click()

    const sec = localSection(page)
    await sec.getByRole('button', { name: 'Lokalen Coach fragen' }).click()
    await expect(sec.getByText(/Der lokale Coach hat zweimal keine gültige Antwort geliefert/)).toBeVisible({ timeout: 30_000 })
    await expect(sec.getByText('Rohantwort')).toBeVisible()
    expect(fake.chatCalls).toHaveLength(2)

    const detail = await invoke<PlanDetail>(page, 'plans:get', planId)
    const s = detail.weeks.flatMap(w => w.sessions).find(x => x.id === sessionId)!
    expect(s.targetDistanceKm).toBe(10)
  })
})
