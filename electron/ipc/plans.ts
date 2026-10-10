import { ipcMain } from 'electron'
import { IPC } from '../../src/types/ipc'
import type {
  CreatePlanPayload,
  PlanRow,
  IpcResponse,
  UpdateSessionStatusPayload,
  LinkSessionActivityPayload,
  AdaptPlanPayload,
  AdaptPlanResult,
} from '../../src/types/ipc'
import { getDb, markDirty } from '../../db/index'
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
  ipcMain.handle(
    IPC.PLANS_CREATE,
    async (_e, payload: CreatePlanPayload): Promise<IpcResponse<PlanRow>> => {
      try {
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

        markDirty()
        return { success: true, data: plan as PlanRow }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.PLANS_LIST,
    async (): Promise<IpcResponse<PlanRow[]>> => {
      try {
        const db = getDb()
        const rows = db.select().from(trainingPlans).all()
        return { success: true, data: rows as PlanRow[] }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.PLANS_GET,
    async (_e, id: number): Promise<IpcResponse<unknown>> => {
      try {
        const db = getDb()
        const plan = db.select().from(trainingPlans).where(eq(trainingPlans.id, id)).get()
        if (!plan) return { success: true, data: null }

        const phases = db.select().from(planPhases).where(eq(planPhases.planId, id)).all()
        const result = {
          ...plan,
          phases: await Promise.all(
            phases.map(async (phase) => {
              const weeks = db
                .select()
                .from(planWeeks)
                .where(eq(planWeeks.phaseId, phase.id))
                .all()
              return {
                ...phase,
                weeks: await Promise.all(
                  weeks.map(async (week) => {
                    const sessions = db
                      .select()
                      .from(planSessions)
                      .where(eq(planSessions.weekId, week.id))
                      .all()
                    return { ...week, sessions }
                  })
                ),
              }
            })
          ),
        }
        return { success: true, data: result }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.PLANS_DELETE,
    async (_e, id: number): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        db.delete(trainingPlans).where(eq(trainingPlans.id, id)).run()
        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.PLANS_ACTIVATE,
    async (_e, id: number): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        runInTransaction(db, () => {
          db.update(trainingPlans).set({ isActive: 0 }).where(ne(trainingPlans.id, id)).run()
          db.update(trainingPlans).set({ isActive: 1 }).where(eq(trainingPlans.id, id)).run()
        })
        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.SESSIONS_UPDATE_STATUS,
    async (_e, payload: UpdateSessionStatusPayload): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        db.update(planSessions)
          .set({
            status: payload.status,
            completedAt: payload.completedAt ?? null,
            completionNote: payload.completionNote ?? null,
          })
          .where(eq(planSessions.id, payload.sessionId))
          .run()
        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.SESSIONS_LINK_ACTIVITY,
    async (_e, payload: LinkSessionActivityPayload): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        db.update(planSessions)
          .set({ linkedActivityId: payload.activityId })
          .where(eq(planSessions.id, payload.sessionId))
          .run()
        markDirty()
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Adapt an existing plan ───────────────────────────────────────────────────
  // Core logic (and its transaction) lives in ../lib/adaptPlan.ts.
  ipcMain.handle(
    IPC.PLANS_ADAPT,
    async (_e, payload: AdaptPlanPayload): Promise<IpcResponse<AdaptPlanResult>> => {
      try {
        const data = adaptPlan(getDb(), payload)
        markDirty()
        return { success: true, data }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
