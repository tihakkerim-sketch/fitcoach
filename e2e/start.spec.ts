import { test, expect } from './fixtures'

test('frische DB: Onboarding durchklicken, dann alle Seiten', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Willkommen bei FitCoach' })).toBeVisible({ timeout: 30_000 })
  expect(page.url()).toContain('/willkommen')

  await page.getByLabel('Name', { exact: true }).fill('Testlauf')
  await page.getByLabel('Alter').fill('30')
  await page.getByLabel('Max-Puls (bpm)').fill('190')
  await page.getByLabel('Ruhepuls (bpm)').fill('55')
  await page.getByRole('button', { name: 'Weiter' }).click()

  await expect(page.getByRole('heading', { name: 'Dein Ziel' })).toBeVisible()
  await page.getByRole('button', { name: 'Weiter' }).click()

  await expect(page.getByRole('heading', { name: 'Puls-Zonen' })).toBeVisible()
  await expect(page.getByText('Zone 1')).toBeVisible()
  await page.getByRole('button', { name: 'Weiter' }).click()

  await expect(page.getByRole('heading', { name: /Tageswechsel/ })).toBeVisible()
  await page.getByRole('button', { name: 'Weiter' }).click()

  await expect(page.getByRole('heading', { name: 'Trainingsplan' })).toBeVisible()
  await page.getByRole('button', { name: 'Fertig' }).click()

  // Heute-Seite mit Begruessung inkl. Namen
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Testlauf')

  const pages: Array<[string, string]> = [
    ['Erholung', 'Erholung'],
    ['Aktivitäten', 'Aktivitäten'],
    ['Plan', 'Trainingspläne'],
    ['Fortschritt', 'Fortschritt'],
    ['Coach', 'Coach'],
    ['Einstellungen', 'Einstellungen'],
  ]
  for (const [link, heading] of pages) {
    await page.getByRole('navigation').getByRole('link', { name: link, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }
  await page.getByRole('navigation').getByRole('link', { name: 'Heute', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Testlauf')
})

test('Onboarding überspringen führt zu Heute', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Willkommen bei FitCoach' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Überspringen' }).click()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Heute', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Willkommen bei FitCoach' })).toHaveCount(0)
})
