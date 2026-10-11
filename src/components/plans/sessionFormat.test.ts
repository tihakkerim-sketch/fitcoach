import { describe, it, expect } from 'vitest'
import { sessionTargetText, stepsText, statusLabel } from './sessionFormat'
import type { PlanBlock } from '@/types/ipc'

describe('sessionTargetText', () => {
  it('Distanz, Pace-Bereich und Zone', () => {
    expect(sessionTargetText({
      targetDistanceKm: 8, targetDurationMin: null,
      targetPaceFastSec: 360, targetPaceSlowSec: 380, targetHrZone: 2,
    })).toBe('8 km · 6:00–6:20/km · Z2')
  })
  it('Dezimalkomma, Dauer und einzelne Pace', () => {
    expect(sessionTargetText({
      targetDistanceKm: 8.5, targetDurationMin: 50,
      targetPaceFastSec: 350, targetPaceSlowSec: 350, targetHrZone: null,
    })).toBe('8,5 km · 50 min · 5:50/km')
  })
  it('leer, wenn nichts gesetzt ist', () => {
    expect(sessionTargetText({
      targetDistanceKm: null, targetDurationMin: null,
      targetPaceFastSec: null, targetPaceSlowSec: null, targetHrZone: null,
    })).toBe('')
  })
})

describe('stepsText', () => {
  it('Wiederholung mit Belastung und Trabpause', () => {
    const steps: PlanBlock[] = [
      { kind: 'warmup', durationSec: 900 },
      { repeat: 6, steps: [
        { kind: 'work', distanceM: 800, paceFastSec: 290, paceSlowSec: 295 },
        { kind: 'recovery', distanceM: 400 },
      ] },
      { kind: 'cooldown', durationSec: 600 },
    ]
    const lines = stepsText(steps)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('Aufwärmen 15 min')
    expect(lines[1]).toBe('6 × (800 m @ 4:50–4:55/km, 400 m Trabpause)')
    expect(lines[2]).toBe('Auslaufen 10 min')
  })
})

describe('statusLabel', () => {
  const today = '2026-10-12'
  it('geplant in der Vergangenheit = verpasst', () => {
    expect(statusLabel({ status: 'planned', type: 'running', date: '2026-10-11' }, today))
      .toEqual({ label: 'verpasst', tone: 'danger' })
  })
  it('Ruhetag in der Vergangenheit bleibt geplant', () => {
    expect(statusLabel({ status: 'planned', type: 'rest', date: '2026-10-11' }, today).label).toBe('geplant')
  })
  it('heute geplant = heute', () => {
    expect(statusLabel({ status: 'planned', type: 'running', date: today }, today))
      .toEqual({ label: 'heute', tone: 'primary' })
  })
  it('erledigt und übersprungen', () => {
    expect(statusLabel({ status: 'completed', type: 'running', date: today }, today).label).toBe('erledigt')
    expect(statusLabel({ status: 'skipped', type: 'running', date: '2026-10-01' }, today).label).toBe('übersprungen')
  })
  it('Zukunft = geplant', () => {
    expect(statusLabel({ status: 'planned', type: 'running', date: '2026-10-20' }, today).label).toBe('geplant')
  })
})
