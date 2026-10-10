/**
 * Replaces the PLANNED structure of an existing plan with a new one while
 * keeping the user's history. Free of `electron` imports (unit-testable).
 *
 * COMPLETED and SKIPPED sessions are snapshotted first, then restored onto any
 * matching slot in the new structure (phaseOrderIndex + weekNumber + dayOfWeek).
 * The whole operation runs in one transaction: if anything fails, the original
 * plan (phases, weeks, sessions) is left exactly as it was.
 */
import { eq } from 'drizzle-orm'
import type { AdaptPlanPayload, AdaptPlanResult } from '../../src/types/ipc'
import { trainingPlans, planPhases, planWeeks, planSessions } from '../../db/schema'
import { runInTransaction, type TxDb } from './transaction'

type SavedSession = {
  phaseOrderIndex: number
  weekNumber: number
  dayOfWeek: number
  status: 'completed' | 'skipped'
  completedAt: number | null
  completionNote: string | null
  linkedActivityId: number | null
}

export function adaptPlan(db: TxDb, payload: AdaptPlanPayload): AdaptPlanResult {
  const planId = payload.planId

  return runInTransaction(db, () => {
    // ── 1. Snapshot completed / skipped sessions ────────────────────────────
    const savedSessions: SavedSession[] = []

    const existingPhases = db
      .select()
      .from(planPhases)
      .where(eq(planPhases.planId, planId))
      .all()

    for (const phase of existingPhases) {
      const weeks = db
        .select()
        .from(planWeeks)
        .where(eq(planWeeks.phaseId, phase.id))
        .all()

      for (const week of weeks) {
        const sessions = db
          .select()
          .from(planSessions)
          .where(eq(planSessions.weekId, week.id))
          .all()
          .filter(s => s.status === 'completed' || s.status === 'skipped')

        for (const s of sessions) {
          savedSessions.push({
            phaseOrderIndex:  phase.orderIndex,
            weekNumber:       week.weekNumber,
            dayOfWeek:        s.dayOfWeek,
            status:           s.status as 'completed' | 'skipped',
            completedAt:      s.completedAt      ?? null,
            completionNote:   s.completionNote   ?? null,
            linkedActivityId: s.linkedActivityId ?? null,
          })
        }
      }
    }

    // ── 2. Delete old phases (cascades → weeks → sessions) ───────────────────
    db.delete(planPhases).where(eq(planPhases.planId, planId)).run()

    // ── 3. Insert the new plan structure ─────────────────────────────────────
    // Map "phaseOrderIndex:weekNumber:dayOfWeek" → new session id
    const slotMap = new Map<string, number>()

    for (const phase of payload.phases) {
      const [phaseRow] = db
        .insert(planPhases)
        .values({
          planId:        planId,
          name:          phase.name,
          orderIndex:    phase.orderIndex,
          durationWeeks: phase.durationWeeks,
        })
        .returning()
        .all()

      for (const week of phase.weeks) {
        const [weekRow] = db
          .insert(planWeeks)
          .values({
            phaseId:    phaseRow.id,
            weekNumber: week.weekNumber,
            notes:      week.notes ?? null,
          })
          .returning()
          .all()

        for (const session of week.sessions) {
          const [sessionRow] = db
            .insert(planSessions)
            .values({
              weekId:            weekRow.id,
              dayOfWeek:         session.dayOfWeek,
              type:              session.type,
              targetDurationMin: session.targetDurationMin ?? null,
              targetHrZone:      session.targetHrZone      ?? null,
              intensityLabel:    session.intensityLabel    ?? null,
              coachingNote:      session.coachingNote      ?? null,
              status:            'planned',
              linkedActivityId:  null,
              completedAt:       null,
            })
            .returning()
            .all()

          const key = `${phase.orderIndex}:${week.weekNumber}:${session.dayOfWeek}`
          slotMap.set(key, sessionRow.id)
        }
      }
    }

    // ── 4. Restore completed / skipped onto matching new slots ───────────────
    let restored = 0
    for (const s of savedSessions) {
      const key       = `${s.phaseOrderIndex}:${s.weekNumber}:${s.dayOfWeek}`
      const sessionId = slotMap.get(key)
      if (!sessionId) continue   // no matching slot in new structure — history lost for this one

      db.update(planSessions)
        .set({
          status:           s.status,
          completedAt:      s.completedAt,
          completionNote:   s.completionNote,
          linkedActivityId: s.linkedActivityId,
        })
        .where(eq(planSessions.id, sessionId))
        .run()
      restored++
    }

    // ── 5. Update plan metadata ──────────────────────────────────────────────
    db.update(trainingPlans)
      .set({
        name:      payload.name,
        goalEvent: payload.goalEvent ?? null,
        goalDate:  payload.goalDate  ?? null,
      })
      .where(eq(trainingPlans.id, planId))
      .run()

    return { preserved: savedSessions.length, restored }
  })
}
