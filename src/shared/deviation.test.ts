import { describe, it, expect } from 'vitest'
import { computeDeviation } from './deviation'

describe('computeDeviation', () => {
  it('nur Felder mit beiden Seiten', () => {
    expect(computeDeviation({ targetDistanceKm: 16 }, { distanceKm: 11, durationMin: 66 }))
      .toEqual([{ field: 'distance', planned: 16, actual: 11, pct: -31 }])
  })

  it('Dauer', () => {
    expect(computeDeviation({ targetDurationMin: 60 }, { durationMin: 66 }))
      .toEqual([{ field: 'duration', planned: 60, actual: 66, pct: 10 }])
  })

  it('Pace: Mittel aus fast/slow gegen Ist-Pace', () => {
    const r = computeDeviation({ targetPaceFastSec: 330, targetPaceSlowSec: 350 }, { distanceKm: 10, durationMin: 60 })
    expect(r).toEqual([{ field: 'pace', planned: 340, actual: 360, pct: 6 }])
  })

  it('Pace: nur ein Wert vorhanden', () => {
    const r = computeDeviation({ targetPaceSlowSec: 360 }, { distanceKm: 10, durationMin: 60 })
    expect(r).toEqual([{ field: 'pace', planned: 360, actual: 360, pct: 0 }])
  })

  it('leer, wenn nichts vergleichbar ist', () => {
    expect(computeDeviation({}, { distanceKm: 5 })).toEqual([])
    expect(computeDeviation({ targetDistanceKm: 0 }, { distanceKm: 5 })).toEqual([])
    expect(computeDeviation({ targetDistanceKm: 5 }, { distanceKm: null })).toEqual([])
  })
})
