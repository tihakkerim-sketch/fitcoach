import { describe, expect, it } from 'vitest'
import { effectiveZones, karvonenZones, resolveHrBasics, zoneOf } from './zones'

describe('karvonenZones', () => {
  const z = karvonenZones(209, 50)
  it('berechnet 5 lückenlose Zonen', () => {
    expect(z).toHaveLength(5)
    expect(z[0].minHr).toBe(130)
    expect(z[1].minHr).toBe(145)
    expect(z[4].maxHr).toBe(209)
    for (let i = 0; i < 4; i++) expect(z[i].maxHr).toBe(z[i + 1].minHr - 1)
    expect(z.map(x => x.label)).toEqual(['Erholung', 'Grundlage', 'Tempo', 'Schwelle', 'VO2max'])
  })
  it('zoneOf findet Zone oder null', () => {
    expect(zoneOf(150, z)).toBe(2)
    expect(zoneOf(209, z)).toBe(5)
    expect(zoneOf(100, z)).toBeNull()
    expect(zoneOf(230, z)).toBeNull()
  })
})

describe('resolveHrBasics', () => {
  it('nimmt Profilwerte', () => {
    expect(resolveHrBasics({ profileMaxHr: 190, profileRestHr: 50 })).toEqual({
      maxHr: 190, restHr: 50, maxSource: 'profile', restSource: 'profile',
    })
  })
  it('Max aus Läufen, Ruhe als Median der Recovery-Werte', () => {
    const r = resolveHrBasics({ observedMaxHr: 195, recoveryRestHrs: [50, 54, 52, 60] })
    expect(r).toEqual({ maxHr: 195, restHr: 53, maxSource: 'observed', restSource: 'recovery' })
  })
  it('Ruhe-Standard 60', () => {
    expect(resolveHrBasics({ profileMaxHr: 190 })?.restHr).toBe(60)
    expect(resolveHrBasics({ profileMaxHr: 190 })?.restSource).toBe('default')
  })
  it('ohne Max oder mit Ruhe >= Max null', () => {
    expect(resolveHrBasics({ profileRestHr: 50 })).toBeNull()
    expect(resolveHrBasics({ profileMaxHr: 50, profileRestHr: 60 })).toBeNull()
  })
})

describe('effectiveZones', () => {
  const saved = [{ zoneNumber: 1, minHr: 100, maxHr: 120, label: 'x' }]
  const hr = { maxHr: 190, restHr: 50, maxSource: 'profile' as const, restSource: 'profile' as const }
  it('gespeichert > berechnet > none', () => {
    expect(effectiveZones(saved, hr).source).toBe('saved')
    const c = effectiveZones([], hr)
    expect(c.source).toBe('computed')
    expect(c.zones).toHaveLength(5)
    expect(effectiveZones([], null)).toEqual({ zones: [], source: 'none' })
  })
})
