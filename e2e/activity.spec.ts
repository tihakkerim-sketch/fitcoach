import { test, expect, skipOnboarding, invoke } from './fixtures'

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

test('Läufe für Claude kopieren', async ({ page }) => {
  await skipOnboarding(page)
  const day = await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() - 2)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  })
  await invoke(page, 'activities:create', { type: 'running', date: day, source: 'manual', distanceKm: 7.77, durationMin: 45, avgHr: 150 })
  await invoke(page, 'activities:create', { type: 'running', date: day, source: 'manual', distanceKm: 12.34, durationMin: 70 })

  await page.getByRole('navigation').getByRole('link', { name: 'Aktivitäten', exact: true }).click()
  await page.getByRole('button', { name: 'Für Claude kopieren' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Läufe für Claude kopieren' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Kopieren', exact: true }).click()
  await expect(dialog.getByText('Kopiert ✓ – in Claude einfügen')).toBeVisible()
  await expect(dialog.getByText('2 Läufe')).toBeVisible()

  const md = await invoke<string>(page, 'export:runs', { dateFrom: day, dateTo: day })
  expect(md).toContain('# Läufe zur Auswertung')
  expect(md).toContain('7.77 km')
  expect(md).toContain('12.34 km')
})
