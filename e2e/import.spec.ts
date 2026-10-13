import path from 'node:path'
import { test, expect, skipOnboarding } from './fixtures'

const TCX = path.join(__dirname, 'fixtures', 'lauf.tcx')

test('TCX-Import: Lauf erscheint, zweiter Import wird als Duplikat erkannt', async ({ page }) => {
  await skipOnboarding(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Aktivitäten', exact: true }).click()
  await expect(page.getByText('Noch keine Aktivitäten')).toBeVisible()

  const input = page.locator('input[type="file"]')
  await input.setInputFiles(TCX)
  await expect(page.getByText('1 neu · 0 doppelt · 0 Fehler')).toBeVisible()
  await expect(page.getByText('neu importiert')).toBeVisible()
  await expect(page.getByText('Datei-Import')).toBeVisible()
  await expect(page.getByText('2,50 km')).toBeVisible()
  await expect(page.getByText('Noch keine Aktivitäten')).toHaveCount(0)

  await input.setInputFiles(TCX)
  await expect(page.getByText('0 neu · 1 doppelt · 0 Fehler')).toBeVisible()
  await expect(page.getByText('2,50 km')).toHaveCount(1)
})
