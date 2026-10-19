import { format } from 'date-fns'
import { test, expect, invoke, skipOnboarding } from './fixtures'
import { addDaysStr, mondayOf, todayLocal } from '../src/shared/planCalendar'

const SHOTS = process.env.FITCOACH_SHOTS // optionaler Ordner für Bildschirmfotos (Sichtprüfung)

/** Woche/Wochentag eines Datums relativ zum Montag `start`. */
function slot(start: string, date: string) {
  const days = Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86_400_000)
  return { week: Math.floor(days / 7), dayOfWeek: (days % 7) + 1 }
}

test('Plan-Anpassung: Lauf → „Wie war\'s?“ → Vorschlag → übernehmen', async ({ page }) => {
  await skipOnboarding(page, { maxHr: 190, restingHr: 50, dayStartHour: 4 })

  const today = todayLocal(new Date(), 4)
  const start = mondayOf(today)
  const easy = slot(start, today)
  const hard = slot(start, addDaysStr(today, 3)) // harte Einheit in 3 Tagen
  const weeks = [{ sessions: [] as unknown[] }, { sessions: [] as unknown[] }]
  weeks[easy.week].sessions.push({ dayOfWeek: easy.dayOfWeek, type: 'running', title: 'Lockerer Lauf', targetDistanceKm: 8, targetHrZone: 2 })
  weeks[hard.week].sessions.push({ dayOfWeek: hard.dayOfWeek, type: 'running', title: 'Intervalle', targetDistanceKm: 10, targetHrZone: 4 })
  const plan = await invoke<{ id: number }>(page, 'plans:create', { name: 'E2E-Anpassung', startDate: start, weeks })
  await invoke(page, 'plans:activate', plan.id)

  // Lauf von heute → wird der lockeren Einheit zugeordnet
  await invoke(page, 'activities:create', {
    type: 'running', date: today, source: 'manual', startTime: format(new Date(), 'HH:mm'),
    distanceKm: 8, durationMin: 48, avgHr: 140,
  })
  await page.reload()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText("Wie war's?")).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-feedback.png` })
  await dialog.getByRole('radio', { name: '9' }).click()
  await dialog.getByRole('button', { name: 'Speichern' }).click()
  await expect(dialog).toHaveCount(0)

  const card = page.getByTestId('proposal-card')
  await expect(card).toContainText('Plan-Vorschlag')
  await expect(card).toContainText('9/10')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-vorschlag.png` })
  await card.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByText('Plan angepasst.')).toBeVisible()
  await expect(card).toHaveCount(0)

  const detail = await invoke<{ weeks: { sessions: { title: string | null; targetDistanceKm: number | null }[] }[] }>(page, 'plans:get', plan.id)
  const intervals = detail.weeks.flatMap(w => w.sessions).find(s => s.title === 'Intervalle')!
  expect(intervals.targetDistanceKm).toBe(9)

  if (SHOTS) {
    await page.getByRole('navigation').getByRole('link', { name: 'Plan', exact: true }).click()
    await expect(page.getByTestId('pace-status')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/3-plan.png` })
    await page.getByRole('button', { name: 'Nicht 100 %' }).click()
    await page.screenshot({ path: `${SHOTS}/4-nicht100.png` })
  }
})
