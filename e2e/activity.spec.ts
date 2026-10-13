import { test, expect, skipOnboarding } from './fixtures'

test('Lauf anlegen, bearbeiten, löschen und wiederherstellen', async ({ page }) => {
  await skipOnboarding(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Aktivitäten', exact: true }).click()
  await expect(page.getByText('Noch keine Aktivitäten')).toBeVisible()

  // Anlegen
  await page.getByRole('button', { name: 'Aktivität erfassen' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Aktivität erfassen' })).toBeVisible()
  await dialog.getByLabel('Dauer (min) *').fill('45')
  await dialog.getByLabel('Distanz (km)').fill('7.5')
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('7,50 km')).toBeVisible()
  await expect(page.getByText('45 min', { exact: true })).toBeVisible()

  // Bearbeiten
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await expect(dialog.getByRole('heading', { name: 'Aktivität bearbeiten' })).toBeVisible()
  await dialog.getByLabel('Distanz (km)').fill('9.25')
  await dialog.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('9,25 km')).toBeVisible()
  await expect(page.getByText('7,50 km')).toHaveCount(0)

  // Loeschen + Rueckgaengig
  await page.getByRole('button', { name: 'Löschen' }).click()
  await expect(page.getByText('Aktivität gelöscht')).toBeVisible()
  await expect(page.getByText('Noch keine Aktivitäten')).toBeVisible()
  await page.getByRole('button', { name: 'Rückgängig' }).click()
  await expect(page.getByText('9,25 km')).toBeVisible()
  await expect(page.getByText('Noch keine Aktivitäten')).toHaveCount(0)
})
