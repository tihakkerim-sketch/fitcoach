import { IPC } from '../../src/types/ipc'
import type { PlanRow, PlanDetail } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import {
  trainingPlans,
  planPhases,
  planWeeks,
  planSessions,
} from '../../db/schema'
import { eq, ne } from 'drizzle-orm'
import { runInTransaction } from '../lib/transaction'
import { adaptPlan } from '../lib/adaptPlan'

export function registerPlanHandlers() {
  handle(IPC.PLANS_CREATE, (payload) => {
    const db = getDb()
    const now = Date.now()

    // One transaction: a failure midway must not leave a half-built plan behind
    const plan = runInTransaction(db, () => {
      const [planRow] = db
        .insert(trainingPlans)
        .values({
          name: payload.name,
          goalEvent: payload.goalEvent ?? null,
          goalDate: payload.goalDate ?? null,
          isActive: 1,
          createdAt: now,
        })
        .returning()
        .all()

      for (const phase of payload.phases) {
        const [phaseRow] = db
          .insert(planPhases)
          .values({
            planId: planRow.id,
            name: phase.name,
            orderIndex: phase.orderIndex,
            durationWeeks: phase.durationWeeks,
          })
          .returning()
          .all()

        for (const week of phase.weeks) {
          const [weekRow] = db
            .insert(planWeeks)
            .values({
              phaseId: phaseRow.id,
              weekNumber: week.weekNumber,
              notes: week.notes ?? null,
            })
            .returning()
            .all()

          for (const session of week.sessions) {
            db.insert(planSessions)
              .values({
                weekId: weekRow.id,
                dayOfWeek: session.dayOfWeek,
                type: session.type,
                targetDurationMin: session.targetDurationMin ?? null,
                targetHrZone: session.targetHrZone ?? null,
                intensityLabel: session.intensityLabel ?? null,
                coachingNote: session.coachingNote ?? null,
                status: 'planned',
                linkedActivityId: null,
                completedAt: null,
              })
              .run()
          }
        }
      }

      return planRow
    })

    return plan as PlanRow
  })

  handle(IPC.PLANS_LIST, () => getDb().select().from(trainingPlans).all() as PlanRow[])

  handle(IPC.PLANS_GET, (id) => {
    const db = getDb()
    const plan = db.select().from(trainingPlans).where(eq(trainingPlans.id, id)).get()
    if (!plan) return null

    const phases = db.select().from(planPhases).where(eq(planPhases.planId, id)).all()
    const result = {
      ...plan,
      phases: phases.map((phase) => {
        const weeks = db
          .select()
          .from(planWeeks)
          .where(eq(planWeeks.phaseId, phase.id))
          .all()
        return {
          ...phase,
          weeks: weeks.map((week) => {
            const sessions = db
              .select()
              .from(planSessions)
              .where(eq(planSessions.weekId, week.id))
              .all()
            return { ...week, sessions }
          }),
        }
      }),
    }
    return result as unknown as PlanDetail
  })

  handle(IPC.PLANS_DELETE, (id) => {
    getDb().delete(trainingPlans).where(eq(trainingPlans.id, id)).run()
  })

  handle(IPC.PLANS_ACTIVATE, (id) => {
    const db = getDb()
    runInTransaction(db, () => {
      db.update(trainingPlans).set({ isActive: 0 }).where(ne(trainingPlans.id, id)).run()
      db.update(trainingPlans).set({ isActive: 1 }).where(eq(trainingPlans.id, id)).run()
    })
  })

  handle(IPC.SESSIONS_UPDATE_STATUS, (payload) => {
    getDb().update(planSessions)
      .set({
        status: payload.status,
        completedAt: payload.completedAt ?? null,
        completionNote: payload.completionNote ?? null,
      })
      .where(eq(planSessions.id, payload.sessionId))
      .run()
  })

  handle(IPC.SESSIONS_LINK_ACTIVITY, (payload) => {
    getDb().update(planSessions)
      .set({ linkedActivityId: payload.activityId })
      .where(eq(planSessions.id, payload.sessionId))
      .run()
  })

  // ── Adapt an existing plan ───────────────────────────────────────────────────
  // Core logic (and its transaction) lives in ../lib/adaptPlan.ts.
  handle(IPC.PLANS_ADAPT, (payload) => adaptPlan(getDb(), payload))
}
