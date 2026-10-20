import { describe, it, expect } from 'vitest'
import { COACH_CHANGES_FORMAT } from '../../src/shared/coach/changesFormat'
import { buildLocalCoachMessages, chooseNumCtx, LOCAL_COACH_SCHEMA, localCoachAnswerSchema, parseLocalCoachAnswer } from './ollamaPrompt'

const answer = {
  explanation: 'Die Woche war ruhig, ich kürze den langen Lauf leicht.',
  fitcoachChanges: {
    fitcoachChanges: 1,
    summary: 'Langen Lauf kürzen',
    changes: [{ action: 'update', sessionId: 12, set: { distanceKm: 10 }, reason: 'Wade' }],
  },
}

describe('buildLocalCoachMessages', () => {
  it('builds a system message (role, safety rules, format) and the report as user message', () => {
    const msgs = buildLocalCoachMessages('BERICHT #5 Lauf')
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('Lauf-Coach')
    expect(msgs[0].content).toContain('Wade')
    expect(msgs[0].content).toContain('10 %')
    expect(msgs[0].content).toContain('#id')
    expect(msgs[0].content).toContain(COACH_CHANGES_FORMAT)
    expect(msgs[1]).toEqual({ role: 'user', content: 'BERICHT #5 Lauf' })
  })
})

describe('chooseNumCtx', () => {
  it('uses 8192 for normal reports and 12288 for long ones', () => {
    expect(chooseNumCtx(0)).toBe(8192)
    expect(chooseNumCtx(18_000)).toBe(8192) // 6000 + 2048 = 8048
    expect(chooseNumCtx(18_500)).toBe(12288) // 6167 + 2048 > 8192
    expect(chooseNumCtx(100_000)).toBe(12288)
  })
})

describe('LOCAL_COACH_SCHEMA', () => {
  it('requires explanation and fitcoachChanges with changes items having an action', () => {
    const s = LOCAL_COACH_SCHEMA as any
    expect(s.type).toBe('object')
    expect(s.required).toEqual(['explanation', 'fitcoachChanges'])
    expect(s.properties.explanation).toMatchObject({ type: 'string', maxLength: 2000 })
    const fc = s.properties.fitcoachChanges
    expect(fc.required).toEqual(['fitcoachChanges', 'summary', 'changes'])
    expect(fc.properties.changes.items).toMatchObject({ type: 'object', required: ['action'] })
    expect(fc.properties.changes.items.properties).toMatchObject({
      sessionId: { type: 'integer' },
      date: { type: 'string' },
      set: { type: 'object' },
      session: { type: 'object' },
      reason: { type: 'string' },
    })
  })
})

describe('localCoachAnswerSchema', () => {
  it('accepts a valid answer and keeps unknown change fields', () => {
    const r = localCoachAnswerSchema.safeParse(answer)
    expect(r.success).toBe(true)
    expect((r.data as any).fitcoachChanges.changes[0].sessionId).toBe(12)
  })
  it('rejects empty or too long explanation, wrong version, change without action', () => {
    expect(localCoachAnswerSchema.safeParse({ ...answer, explanation: '' }).success).toBe(false)
    expect(localCoachAnswerSchema.safeParse({ ...answer, explanation: 'x'.repeat(2001) }).success).toBe(false)
    expect(localCoachAnswerSchema.safeParse({ ...answer, fitcoachChanges: { ...answer.fitcoachChanges, fitcoachChanges: 2 } }).success).toBe(false)
    expect(localCoachAnswerSchema.safeParse({ ...answer, fitcoachChanges: { ...answer.fitcoachChanges, changes: [{ sessionId: 1 }] } }).success).toBe(false)
  })
})

describe('parseLocalCoachAnswer', () => {
  it('parses plain valid JSON', () => {
    const r = parseLocalCoachAnswer(JSON.stringify(answer))
    expect(r).toEqual({ ok: true, answer })
  })
  it('accepts empty changes', () => {
    const a = { ...answer, fitcoachChanges: { fitcoachChanges: 1, summary: 'Keine Änderung', changes: [] } }
    const r = parseLocalCoachAnswer(JSON.stringify(a))
    expect(r.ok).toBe(true)
  })
  it('extracts JSON from a ```json block', () => {
    const raw = 'Hier:\n```json\n' + JSON.stringify(answer, null, 2) + '\n```\nViel Erfolg!'
    expect(parseLocalCoachAnswer(raw)).toEqual({ ok: true, answer })
  })
  it('extracts JSON surrounded by text (outermost braces, braces inside strings ok)', () => {
    const a = { ...answer, explanation: 'Tipp: nutze {geschweifte} Klammern' }
    const r = parseLocalCoachAnswer('Antwort: ' + JSON.stringify(a) + ' Ende.')
    expect(r).toEqual({ ok: true, answer: a })
  })
  it('reports broken JSON', () => {
    const r = parseLocalCoachAnswer('{"explanation": "abc", ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/JSON/)
  })
  it('reports no JSON at all and empty input', () => {
    expect(parseLocalCoachAnswer('Keine Ahnung').ok).toBe(false)
    expect(parseLocalCoachAnswer('').ok).toBe(false)
  })
  it('reports wrong types with the failing path', () => {
    const r = parseLocalCoachAnswer(JSON.stringify({ explanation: 5, fitcoachChanges: { fitcoachChanges: 1, summary: 's', changes: 'x' } }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('explanation')
      expect(r.message).toContain('fitcoachChanges.changes')
    }
  })
})
