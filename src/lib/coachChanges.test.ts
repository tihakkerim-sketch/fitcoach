import { describe, it, expect } from 'vitest'
import type { PlanDetail, SessionRow } from '@/types/ipc'
import { COACH_CHANGES_FORMAT, parseCoachChanges, sessionSummary } from './coachChanges'

const TODAY = '2026-10-14'

function session(id: number, weekIndex: number, dayOfWeek: number, over: Partial<SessionRow> = {}): SessionRow {
  const d = new Date(Date.UTC(2026, 9, 5 + weekIndex * 7 + dayOfWeek - 1))
  return {
    id, weekId: weekIndex + 1, weekIndex, dayOfWeek, date: d.toISOString().slice(0, 10), type: 'running', title: null,
    targetDistanceKm: 10, targetDurationMin: null, targetPaceFastSec: 360, targetPaceSlowSec: 380, targetHrZone: 2,
    steps: null, coachingNote: null, status: 'planned', linkedActivityId: null, matchSource: null,
    completedAt: null, completionNote: null, activity: null, ...over,
  }
}

const plan = {
  id: 1, name: 'P', goalEvent: null, goalDate: null, startDate: '2026-10-05', isActive: 1, createdAt: 1, weekCount: 3,
  weeks: [
    { id: 1, weekIndex: 0, sessions: [session(1, 0, 2)] },
    { id: 2, weekIndex: 1, sessions: [session(2, 1, 4), session(3, 1, 6, { status: 'completed' }), session(4, 1, 7, { title: 'Langer Lauf' })] },
    { id: 3, weekIndex: 2, sessions: [] },
  ],
} as unknown as PlanDetail

const wrap = (changes: unknown[], summary = 'Test') => JSON.stringify({ fitcoachChanges: 1, summary, changes })
const one = (change: unknown) => parseCoachChanges(wrap([change]), plan, TODAY).items[0]

describe('parseCoachChanges', () => {
  it('liest JSON aus einem Zaun mit Text drumherum', () => {
    const raw = `Hier mein Vorschlag:\n\`\`\`json\n${wrap([{ action: 'remove', sessionId: 2, reason: 'müde' }], 'Entlastung')}\n\`\`\`\nViel Erfolg!`
    const r = parseCoachChanges(raw, plan, TODAY)
    expect(r.summary).toBe('Entlastung')
    expect(r.items).toHaveLength(1)
    expect(r.items[0].reason).toBe('müde')
  })

  it('liest JSON ohne Zaun mitten im Text', () => {
    const r = parseCoachChanges(`Okay: ${wrap([{ action: 'remove', sessionId: 2 }])} Ende`, plan, TODAY)
    expect(r.items[0].error).toBeNull()
  })

  it('wirft bei fehlendem JSON oder fehlender changes-Liste', () => {
    expect(() => parseCoachChanges('nur Text', plan, TODAY)).toThrow(/kein gültiges JSON/)
    expect(() => parseCoachChanges('{"summary":"x"}', plan, TODAY)).toThrow(/changes/)
  })

  it('update: übersetzt Felder und zeigt vorher/nachher', () => {
    const it = one({ action: 'update', sessionId: 2, set: { distanceKm: 8, pace: '6:00-6:20', note: 'locker' } })
    expect(it.error).toBeNull()
    expect(it.change).toEqual({
      action: 'update', sessionId: 2,
      set: { targetDistanceKm: 8, targetPaceFastSec: 360, targetPaceSlowSec: 380, coachingNote: 'locker' },
    })
    expect(it.title).toBe('Do 15.10. · Lauf')
    expect(it.before).toBe('10 km · 6:00–6:20/km · Z2')
    expect(it.after).toBe('8 km · 6:00–6:20/km · Z2')
  })

  it('update: null löscht ein Feld', () => {
    const it = one({ action: 'update', sessionId: 2, set: { hrZone: null, pace: null } })
    expect(it.error).toBeNull()
    expect(it.change).toEqual({
      action: 'update', sessionId: 2, set: { targetHrZone: null, targetPaceFastSec: null, targetPaceSlowSec: null },
    })
    expect(it.after).toBe('10 km')
  })

  it('move: vorher/nachher sind Daten', () => {
    const it = one({ action: 'move', sessionId: 2, date: '2026-10-16' })
    expect(it.change).toEqual({ action: 'move', sessionId: 2, date: '2026-10-16' })
    expect(it.before).toBe('Do 15.10.')
    expect(it.after).toBe('Fr 16.10.')
  })

  it('remove: Titel bevorzugt den Einheitentitel', () => {
    const it = one({ action: 'remove', sessionId: 4 })
    expect(it.title).toBe('So 18.10. · Langer Lauf')
    expect(it.after).toBe('entfernt')
  })

  it('add: ohne vorher', () => {
    const it = one({ action: 'add', date: '2026-10-20', session: { type: 'running', distanceKm: 6, pace: '6:10' } })
    expect(it.error).toBeNull()
    expect(it.before).toBeNull()
    expect(it.after).toBe('6 km · 6:10/km')
    expect(it.title).toBe('Di 20.10. · Lauf')
    expect(it.change).toMatchObject({ action: 'add', date: '2026-10-20', session: { type: 'running', targetDistanceKm: 6 } })
  })

  it('Fehler: unbekannte Einheit', () => {
    const it = one({ action: 'remove', sessionId: 99 })
    expect(it.change).toBeNull()
    expect(it.error).toBe('Einheit #99 gibt es in diesem Plan nicht.')
  })

  it('Fehler: erledigte Einheit', () => {
    expect(one({ action: 'remove', sessionId: 3 }).error).toMatch(/bereits erledigt/)
  })

  it('Fehler: Einheit in der Vergangenheit', () => {
    expect(one({ action: 'update', sessionId: 1, set: { distanceKm: 5 } }).error).toMatch(/Vergangenheit/)
  })

  it('Fehler: ungültige Pace', () => {
    expect(one({ action: 'update', sessionId: 2, set: { pace: 'schnell' } }).error).toMatch(/Pace "schnell"/)
  })

  it('Fehler: Ziel-Datum außerhalb des Plans oder vergangen', () => {
    expect(one({ action: 'move', sessionId: 2, date: '2026-12-01' }).error).toMatch(/außerhalb des Plans/)
    expect(one({ action: 'add', date: '2026-10-10', session: { type: 'running' } }).error).toMatch(/Vergangenheit/)
  })

  it('Fehler: unbekannte Aktion; andere Einträge bleiben gültig', () => {
    const r = parseCoachChanges(wrap([{ action: 'explode', sessionId: 2 }, { action: 'remove', sessionId: 2 }]), plan, TODAY)
    expect(r.items[0].error).toMatch(/Unbekannte Aktion/)
    expect(r.items[1].error).toBeNull()
    expect(r.items[1].index).toBe(1)
  })

  it('Fehler: Zod-Prüfung (HF-Zone 9)', () => {
    expect(one({ action: 'update', sessionId: 2, set: { hrZone: 9 } }).error).not.toBeNull()
  })
})

describe('sessionSummary / Format', () => {
  it('fällt ohne Ziele auf den Typ zurück', () => {
    expect(sessionSummary({ type: 'rest' })).toBe('Ruhetag')
  })
  it('Formatblock nennt die Schlüssel', () => {
    expect(COACH_CHANGES_FORMAT).toContain('"fitcoachChanges": 1')
    for (const a of ['update', 'move', 'remove', 'add']) expect(COACH_CHANGES_FORMAT).toContain(`"${a}"`)
  })
})
