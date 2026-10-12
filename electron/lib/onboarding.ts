/** Onboarding-Status: erscheint nur bei leerem Profil und ohne Merker `onboarding_done`. Ohne `electron`-Import. */
import { eq } from 'drizzle-orm'
import { userProfile } from '../../db/schema'
import { getSetting, setSetting } from './appSettings'
import type { TxDb } from './transaction'

export const ONBOARDING_KEY = 'onboarding_done'

export function onboardingNeeded(db: TxDb): boolean {
  if (getSetting(db, ONBOARDING_KEY) !== null) return false
  const p = db.select().from(userProfile).where(eq(userProfile.id, 1)).get()
  if (!p) return true
  return !p.name?.trim() && !p.maxHr && !p.goalEvent?.trim()
}

export function completeOnboarding(db: TxDb): void {
  setSetting(db, ONBOARDING_KEY, '1')
}
