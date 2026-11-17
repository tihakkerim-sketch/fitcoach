import { format } from 'date-fns'
import { test, expect, invoke, skipOnboarding } from './fixtures'
import { addDaysStr, todayLocal, mondayOf } from '../src/shared/planCalendar'

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

test('Plan: Lauf getauscht – nachgeholte Einheit wählen, andere wird übersprungen', async ({ page }) => {
  await skipOnboarding(page, { dayStartHour: 4 })

  const today = todayLocal(new Date(), 4)
  const before = addDaysStr(today, -2)
  const start = mondayOf(before)
  const slot = (date: string) => {
    const days = Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86_400_000)
    return { week: Math.floor(days / 7), dayOfWeek: (days % 7) + 1 }
  }
  const weeks = [{ sessions: [] as unknown[] }, { sessions: [] as unknown[] }]
  const a = slot(before), b = slot(today)
  weeks[a.week].sessions.push({ dayOfWeek: a.dayOfWeek, type: 'running', title: 'Langer Lauf', targetDistanceKm: 14 })
  weeks[b.week].sessions.push({ dayOfWeek: b.dayOfWeek, type: 'running', title: 'Lockerer Lauf', targetDistanceKm: 6 })
  const plan = await invoke<{ id: number }>(page, 'plans:create', { name: 'E2E-Tausch', startDate: start, weeks })
  await invoke(page, 'plans:activate', plan.id)
  // Heute gelaufen → wird automatisch der heutigen Einheit zugeordnet
  await invoke(page, 'activities:create', {
    type: 'running', date: today, source: 'manual', startTime: '07:00', distanceKm: 14, durationMin: 84,
  })

  await page.evaluate(id => { location.hash = `#/plan/${id}` }, plan.id)
  await page.reload()
  const feedback = page.getByRole('dialog').filter({ hasText: "Wie war's?" })
  if (await feedback.isVisible().catch(() => false)) await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /Langer Lauf/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Lauf wählen' }).click()
  await expect(dialog.getByText(/zählt für/)).toBeVisible()
  await dialog.getByRole('button', { name: /Lauf ·/ }).click()
  await expect(dialog.getByText(/Dieser Lauf zählt gerade für/)).toContainText('Lockerer Lauf')
  await dialog.getByRole('button', { name: /Getauscht/ }).click()
  await expect(dialog.getByText('manuell zugeordnet')).toBeVisible()

  const detail = await invoke<{ weeks: { sessions: { title: string | null; status: string; completionNote: string | null }[] }[] }>(page, 'plans:get', plan.id)
  const all = detail.weeks.flatMap(w => w.sessions)
  expect(all.find(s => s.title === 'Langer Lauf')!.status).toBe('completed')
  const swapped = all.find(s => s.title === 'Lockerer Lauf')!
  expect(swapped.status).toBe('skipped')
  expect(swapped.completionNote).toContain('Getauscht')
})
