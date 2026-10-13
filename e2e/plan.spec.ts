import { format } from 'date-fns'
import { test, expect, invoke, skipOnboarding } from './fixtures'
import { todayLocal, mondayOf } from '../src/shared/planCalendar'

test('Plan: heutige Einheit als erledigt markieren und zurücksetzen', async ({ page }) => {
  await skipOnboarding(page, { dayStartHour: 4 })

  // "Heute" der App (Tageswechsel 4 Uhr) -> Wochentag 1=Mo ... 7=So
  const today = todayLocal(new Date(), 4)
  const dow = Number(format(new Date(`${today}T12:00:00`), 'i'))
  const plan = await invoke<{ id: number }>(page, 'plans:create', {
    name: 'E2E-Plan',
    startDate: mondayOf(today),
    weeks: [{ sessions: [{ dayOfWeek: dow, type: 'running', title: 'Lockerer Dauerlauf', targetDistanceKm: 8, targetDurationMin: 50 }] }],
  })
  await invoke(page, 'plans:activate', plan.id)

  await page.reload()
  const card = page.getByRole('button', { name: /^Lockerer Dauerlauf Lauf/ })
  await expect(card).toBeVisible()
  await expect(card).toContainText('heute')

  await card.click()
  await page.getByRole('button', { name: 'Erledigt', exact: true }).click()
  await expect(page.getByText('Manuell als erledigt markiert')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).toContainText('erledigt')

  await card.click()
  await page.getByRole('button', { name: 'Zurücksetzen' }).click()
  await expect(page.getByRole('button', { name: 'Erledigt', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).toContainText('heute')
})
