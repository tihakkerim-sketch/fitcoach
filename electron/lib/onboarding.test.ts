import { describe, it, expect } from 'vitest'
import { userProfile } from '../../db/schema'
import { makeTestDb } from './testDb'
import { completeOnboarding, onboardingNeeded } from './onboarding'

describe('Onboarding', () => {
  it('nötig ohne Profil oder bei leerem Profil', async () => {
    const db = await makeTestDb()
    expect(onboardingNeeded(db)).toBe(true)
    db.insert(userProfile).values({ id: 1, name: '  ' }).run()
    expect(onboardingNeeded(db)).toBe(true)
  })
  it('nicht nötig, sobald Name, Max-Puls oder Ziel gesetzt sind', async () => {
    for (const v of [{ name: 'Adel' }, { maxHr: 190 }, { goalEvent: 'Halbmarathon' }]) {
      const db = await makeTestDb()
      db.insert(userProfile).values({ id: 1, ...v }).run()
      expect(onboardingNeeded(db)).toBe(false)
    }
  })
  it('nicht mehr nötig nach complete', async () => {
    const db = await makeTestDb()
    completeOnboarding(db)
    expect(onboardingNeeded(db)).toBe(false)
  })
})
