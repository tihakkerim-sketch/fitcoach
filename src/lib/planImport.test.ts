import { describe, it, expect } from 'vitest'
import type { PlanDetail } from '@/types/ipc'
import { parsePlanJson, toCreatePayload, planToJsonV2, buildAdaptPrompt, CLAUDE_IMPORT_PROMPT, planStats } from './planImport'

const V2 = JSON.stringify({
  version: 2,
  name: 'Halbmarathon',
  goalEvent: 'HM Wien',
  goalDate: '2027-04-18',
  startDate: '2026-10-12',
  weeks: [{
    phase: 'Grundlage',
    notes: 'Ruhig starten',
    sessions: [{
      day: 'Mo', type: 'running', title: 'Lockerer Lauf',
      distanceKm: 8, durationMin: 50, pace: '6:00-6:20', hrZone: 2, note: 'locker bleiben',
    }],
  }],
})

describe('parsePlanJson – Format v2', () => {
  it('liest das Beispiel aus der Spec', () => {
    const p = parsePlanJson(V2)
    expect(p.name).toBe('Halbmarathon')
    expect(p.startDate).toBe('2026-10-12')
    expect(p.weeks).toHaveLength(1)
    expect(p.weeks[0].phase).toBe('Grundlage')
    const s = p.weeks[0].sessions[0]
    expect(s.dayOfWeek).toBe(1)
    expect(s.targetPaceFastSec).toBe(360)
    expect(s.targetPaceSlowSec).toBe(380)
    expect(s.title).toBe('Lockerer Lauf')
    expect(s.targetHrZone).toBe(2)
    expect(s.coachingNote).toBe('locker bleiben')
  })

  it('entfernt Markdown-Zäune', () => {
    expect(parsePlanJson('```json\n' + V2 + '\n```').name).toBe('Halbmarathon')
  })

  it('versteht englische Tageskürzel', () => {
    const raw = JSON.stringify({ name: 'X', weeks: [{ sessions: [{ day: 'Thu', type: 'running' }] }] })
    expect(parsePlanJson(raw).weeks[0].sessions[0].dayOfWeek).toBe(4)
  })

  it('einzelne Pace gilt als schnell = langsam', () => {
    const raw = JSON.stringify({ name: 'X', weeks: [{ sessions: [{ day: 'Di', type: 'running', pace: '5:30' }] }] })
    const s = parsePlanJson(raw).weeks[0].sessions[0]
    expect([s.targetPaceFastSec, s.targetPaceSlowSec]).toEqual([330, 330])
  })

  it('wandelt 6 × 800 m in Wiederholungsblock um (Pace als Text)', () => {
    const raw = JSON.stringify({
      name: 'X',
      weeks: [{ sessions: [{
        day: 'Mi', type: 'running',
        steps: [
          { kind: 'warmup', durationSec: 900 },
          { repeat: 6, steps: [{ kind: 'work', distanceM: 800, pace: '4:50-4:55' }, { kind: 'recovery', distanceM: 400 }] },
          { kind: 'cooldown', durationSec: 600 },
        ],
      }] }],
    })
    const steps = parsePlanJson(raw).weeks[0].sessions[0].steps!
    expect(steps).toHaveLength(3)
    expect(steps[1]).toEqual({
      repeat: 6,
      steps: [{ kind: 'work', distanceM: 800, paceFastSec: 290, paceSlowSec: 295 }, { kind: 'recovery', distanceM: 400 }],
    })
  })
})

describe('parsePlanJson – altes Format', () => {
  it('rollt weeks: 3 in drei gleiche Wochen aus', () => {
    const raw = JSON.stringify({
      name: 'Alt',
      phases: [{ name: 'Basis', weeks: 3, sessions: [{ day: 'Mon', type: 'running', durationMin: 45, hrZone: 2, label: 'Easy', note: 'n' }] }],
    })
    const p = parsePlanJson(raw)
    expect(p.startDate).toBeNull()
    expect(p.weeks).toHaveLength(3)
    expect(p.weeks.every(w => w.phase === 'Basis')).toBe(true)
    const s = p.weeks[2].sessions[0]
    expect(s).toMatchObject({ dayOfWeek: 1, type: 'running', targetDurationMin: 45, targetHrZone: 2, title: 'Easy', coachingNote: 'n' })
  })
})

describe('parsePlanJson – Fehler (deutsch, mit Position)', () => {
  const withSession = (session: unknown) => JSON.stringify({ name: 'X', weeks: [{ sessions: [session] }] })

  it('ungültige Pace 5:75 nennt Woche und Einheit', () => {
    expect(() => parsePlanJson(withSession({ day: 'Mo', type: 'running', pace: '5:75' })))
      .toThrow('Woche 1, Einheit 1: Pace "5:75" ist ungültig (Format 5:30 oder 5:30-5:50).')
  })

  it('Pace "5:3x" wirft statt abzustürzen', () => {
    expect(() => parsePlanJson(withSession({ day: 'Mo', type: 'running', pace: '5:3x' }))).toThrow(/Pace "5:3x" ist ungültig/)
  })

  it('beschreibende Pace ohne Zahl landet in der Notiz statt zu scheitern', () => {
    const raw = withSession({
      day: 'Do', type: 'running', note: 'Test', pace: 'zügig',
      steps: [
        { kind: 'warmup', durationSec: 900, pace: 'locker, RPE 2' },
        { repeat: 3, steps: [{ kind: 'work', durationSec: 300, pace: '89–94 % LTHR, RPE 5–6' }] },
      ],
    })
    const s = parsePlanJson(raw).weeks[0].sessions[0]
    expect(s.coachingNote).toBe('Test · Tempo: zügig')
    expect(s.targetPaceFastSec).toBeUndefined()
    expect(s.steps).toEqual([
      { kind: 'warmup', durationSec: 900, note: 'locker, RPE 2' },
      { repeat: 3, steps: [{ kind: 'work', durationSec: 300, note: '89–94 % LTHR, RPE 5–6' }] },
    ])
  })

  it('liest JSON mit typografischen Anführungszeichen (vom Handy kopiert)', () => {
    const curly = '{“name”: “HM Linz”, “weeks”: [{“sessions”: [{“day”: “Do”, “type”: “running”, “note”: “‘locker’ laufen”}]}]}'
    const p = parsePlanJson(curly)
    expect(p.name).toBe('HM Linz')
    expect(p.weeks[0].sessions[0].coachingNote).toBe('‘locker’ laufen')
  })

  it('Position zählt Wochen und Einheiten mit', () => {
    const raw = JSON.stringify({
      name: 'X',
      weeks: [{ sessions: [] }, { sessions: [] }, { sessions: [{ day: 'Mo', type: 'running' }, { day: 'Di', type: 'running', pace: '5:75' }] }],
    })
    expect(() => parsePlanJson(raw)).toThrow('Woche 3, Einheit 2:')
  })

  it('ungültiger Tag und Typ', () => {
    expect(() => parsePlanJson(withSession({ day: 'Xx', type: 'running' }))).toThrow(/Woche 1, Einheit 1: Tag "Xx"/)
    expect(() => parsePlanJson(withSession({ day: 'Mo', type: 'schwimmen' }))).toThrow(/Woche 1, Einheit 1: Typ "schwimmen"/)
  })

  it('kein JSON, kein Name, keine Wochen', () => {
    expect(() => parsePlanJson('hallo')).toThrow(/kein gültiges JSON/)
    expect(() => parsePlanJson('{"weeks":[]}')).toThrow(/"name"/)
    expect(() => parsePlanJson('{"name":"X","foo":1}')).toThrow(/weeks/)
  })

  it('mehr als 52 Wochen', () => {
    const raw = JSON.stringify({ name: 'X', weeks: Array.from({ length: 53 }, () => ({ sessions: [] })) })
    expect(() => parsePlanJson(raw)).toThrow('Ein Plan darf höchstens 52 Wochen haben.')
  })

  it('Werte außerhalb des Bereichs (HF-Zone 6)', () => {
    expect(() => parsePlanJson(withSession({ day: 'Mo', type: 'running', hrZone: 6 }))).toThrow(/Woche 1, Einheit 1:/)
  })
})

describe('toCreatePayload / planStats', () => {
  it('setzt das Startdatum ein', () => {
    const parsed = parsePlanJson(V2)
    const payload = toCreatePayload(parsed, '2026-10-19')
    expect(payload.startDate).toBe('2026-10-19')
    expect(payload.weeks).toBe(parsed.weeks)
    expect(planStats(parsed)).toEqual({ totalWeeks: 1, totalSessions: 1 })
  })
})

describe('planToJsonV2', () => {
  const plan: PlanDetail = {
    id: 1, name: 'Plan', goalEvent: 'Marathon', goalDate: '2027-04-18', startDate: '2026-10-05',
    isActive: 1, createdAt: 1, weekCount: 2,
    weeks: [
      {
        id: 1, planId: 1, weekIndex: 0, phase: 'Basis', notes: null, from: '2026-10-05', to: '2026-10-11',
        sessions: [{
          id: 1, weekId: 1, weekIndex: 0, dayOfWeek: 2, date: '2026-10-06', type: 'running', title: 'Tempo',
          targetDistanceKm: 10, targetDurationMin: null, targetPaceFastSec: 330, targetPaceSlowSec: 350, targetHrZone: 3,
          steps: [{ kind: 'warmup', durationSec: 600 }, { repeat: 4, steps: [{ kind: 'work', distanceM: 1000, paceFastSec: 300, paceSlowSec: 300 }] }],
          coachingNote: 'Ruhig', status: 'planned', linkedActivityId: null, matchSource: null,
          completedAt: null, completionNote: null, activity: null,
        }],
      },
      { id: 2, planId: 1, weekIndex: 1, phase: null, notes: 'Entlastung', from: '2026-10-12', to: '2026-10-18', sessions: [] },
    ],
  }

  it('schreibt Pace als Text und lässt sich wieder einlesen (Rundlauf)', () => {
    const json = planToJsonV2(plan)
    expect(json).toContain('"pace": "5:30-5:50"')
    expect(json).toContain('"startDate": "2026-10-05"')
    const back = parsePlanJson(json)
    expect(back.startDate).toBe('2026-10-05')
    expect(back.weeks).toHaveLength(2)
    expect(back.weeks[0].phase).toBe('Basis')
    expect(back.weeks[1].notes).toBe('Entlastung')
    const s = back.weeks[0].sessions[0]
    expect(s).toMatchObject({
      dayOfWeek: 2, type: 'running', title: 'Tempo', targetDistanceKm: 10,
      targetPaceFastSec: 330, targetPaceSlowSec: 350, targetHrZone: 3, coachingNote: 'Ruhig',
    })
    expect(s.steps).toEqual(plan.weeks[0].sessions[0].steps)
  })
})

describe('Prompts', () => {
  it('Import-Prompt beschreibt Format v2 und fordert nur JSON', () => {
    expect(CLAUDE_IMPORT_PROMPT).toContain('"weeks"')
    expect(CLAUDE_IMPORT_PROMPT).toMatch(/Entlastung/)
    expect(CLAUDE_IMPORT_PROMPT).toMatch(/Tapering/)
    expect(CLAUDE_IMPORT_PROMPT).toMatch(/nur .*JSON/i)
  })

  it('Anpassen-Prompt enthält den Plan als JSON und nennt die aktuelle Woche', () => {
    const plan = { id: 1, name: 'Mein Plan', goalEvent: null, goalDate: null, startDate: '2026-10-05', isActive: 1, createdAt: 1, weekCount: 4, weeks: [] } as PlanDetail
    const prompt = buildAdaptPrompt(plan, '2026-10-14')
    expect(prompt).toContain('"name": "Mein Plan"')
    expect(prompt).toContain('Woche 2 ist die aktuelle')
    expect(prompt).toMatch(/vergangene Wochen unverändert/)
  })
})
