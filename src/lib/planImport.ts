/**
 * Shared parsing and transformation logic for Claude → plan JSON imports.
 * Used by both ImportPlanModal (create) and AdaptPlanModal (adapt).
 */
import type { CreatePlanPayload, SessionType } from '@/types/ipc'

// ── Claude JSON shape ─────────────────────────────────────────────────────────

export interface ClaudeSession {
  day: string
  type: string
  durationMin?: number
  hrZone?: number
  label?: string
  note?: string
}

export interface ClaudePhase {
  name: string
  weeks: number
  sessions: ClaudeSession[]
}

export interface ClaudePlan {
  name: string
  goalEvent?: string
  goalDate?: string
  phases: ClaudePhase[]
}

// ── Prompt template (same format for both create and adapt) ──────────────────

export const CLAUDE_IMPORT_PROMPT = `Please create a training plan for me and output it as a single JSON object using EXACTLY this format (no extra text, just the JSON):

{
  "name": "Plan name",
  "goalEvent": "Event name (optional)",
  "goalDate": "YYYY-MM-DD (optional)",
  "phases": [
    {
      "name": "Phase name",
      "weeks": 4,
      "sessions": [
        {
          "day": "Mon",
          "type": "running",
          "durationMin": 45,
          "hrZone": 2,
          "label": "Easy aerobic run",
          "note": "Optional coaching note"
        }
      ]
    }
  ]
}

Rules:
- "day" must be one of: Mon, Tue, Wed, Thu, Fri, Sat, Sun
- "type" must be one of: running, cycling, strength, rest, custom
- "durationMin", "hrZone", "label", "note" are optional
- Sessions listed under a phase repeat every week for that phase
- Output ONLY valid JSON — no markdown fences, no explanation`

export const CLAUDE_ADAPT_PROMPT = `I'm following a training plan and want to update/adapt it based on my recent performance. Output the ADAPTED plan as a single JSON object using EXACTLY this format (no extra text, just the JSON):

{
  "name": "Plan name",
  "goalEvent": "Event name (optional)",
  "goalDate": "YYYY-MM-DD (optional)",
  "phases": [
    {
      "name": "Phase name",
      "weeks": 4,
      "sessions": [
        {
          "day": "Mon",
          "type": "running",
          "durationMin": 45,
          "hrZone": 2,
          "label": "Easy aerobic run",
          "note": "Optional coaching note"
        }
      ]
    }
  ]
}

Rules:
- "day" must be one of: Mon, Tue, Wed, Thu, Fri, Sat, Sun
- "type" must be one of: running, cycling, strength, rest, custom
- "durationMin", "hrZone", "label", "note" are optional
- Sessions listed under a phase repeat every week for that phase
- Output ONLY valid JSON — no markdown fences, no explanation
- My completed workouts will be automatically preserved where the schedule still matches`

// ── Helpers ───────────────────────────────────────────────────────────────────

export const DAY_MAP: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
}

const VALID_TYPES: SessionType[] = ['running', 'cycling', 'strength', 'rest', 'custom']

/** Parse and validate Claude's raw JSON string → ClaudePlan */
export function parsePlanJson(raw: string): ClaudePlan {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const obj = JSON.parse(cleaned)

  if (!obj || typeof obj !== 'object') throw new Error('JSON is not an object')
  if (!obj.name || typeof obj.name !== 'string') throw new Error('"name" field is required')
  if (!Array.isArray(obj.phases) || obj.phases.length === 0) throw new Error('"phases" must be a non-empty array')

  const MAX_WEEKS_PER_PHASE = 52
  const MAX_SESSIONS_PER_WEEK = 7

  for (const [pi, phase] of obj.phases.entries()) {
    if (!phase.name) throw new Error(`Phase ${pi + 1} is missing "name"`)
    if (!phase.weeks || typeof phase.weeks !== 'number' || !Number.isInteger(phase.weeks) || phase.weeks < 1)
      throw new Error(`Phase ${pi + 1} "weeks" must be a positive whole number`)
    if (phase.weeks > MAX_WEEKS_PER_PHASE)
      throw new Error(`Phase ${pi + 1} "weeks" (${phase.weeks}) exceeds the maximum of ${MAX_WEEKS_PER_PHASE}`)
    if (!Array.isArray(phase.sessions))
      throw new Error(`Phase ${pi + 1} "sessions" must be an array`)
    if (phase.sessions.length > MAX_SESSIONS_PER_WEEK)
      throw new Error(`Phase ${pi + 1} has ${phase.sessions.length} sessions — the maximum is ${MAX_SESSIONS_PER_WEEK} per week`)
    for (const [si, s] of phase.sessions.entries()) {
      if (!DAY_MAP[s.day]) throw new Error(`Phase ${pi + 1}, session ${si + 1}: invalid "day" "${s.day}"`)
      if (!VALID_TYPES.includes(s.type as SessionType))
        throw new Error(`Phase ${pi + 1}, session ${si + 1}: invalid "type" "${s.type}"`)
    }
  }

  return obj as ClaudePlan
}

/** Convert parsed ClaudePlan → CreatePlanPayload for the IPC layer */
export function toCreatePayload(plan: ClaudePlan): CreatePlanPayload {
  return {
    name: plan.name,
    goalEvent: plan.goalEvent,
    goalDate: plan.goalDate,
    phases: plan.phases.map((phase, pi) => ({
      name: phase.name,
      orderIndex: pi,
      durationWeeks: phase.weeks,
      weeks: Array.from({ length: phase.weeks }, (_, wi) => ({
        weekNumber: wi + 1,
        sessions: phase.sessions.map(s => ({
          dayOfWeek: DAY_MAP[s.day],
          type: s.type as SessionType,
          targetDurationMin: s.durationMin,
          targetHrZone: s.hrZone,
          intensityLabel: s.label,
          coachingNote: s.note,
        })),
      })),
    })),
  }
}

/** Shared plan preview component data */
export function planStats(plan: ClaudePlan) {
  const totalWeeks    = plan.phases.reduce((s, p) => s + p.weeks, 0)
  const totalSessions = plan.phases.reduce((s, p) => s + p.sessions.length * p.weeks, 0)
  return { totalWeeks, totalSessions }
}
