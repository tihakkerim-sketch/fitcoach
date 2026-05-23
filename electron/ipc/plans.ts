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
import { eq, ne, and } from 'drizzle-orm'

export function registerPlanHandlers() {
  ipcMain.handle(
    IPC.PLANS_CREATE,
    async (_e, payload: CreatePlanPayload): Promise<IpcResponse<PlanRow>> => {
      try {
        const db = getDb()
        const now = Date.now()

        const [plan] = db
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
              planId: plan.id,
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
        db.update(trainingPlans).set({ isActive: 0 }).where(ne(trainingPlans.id, id)).run()
        db.update(trainingPlans).set({ isActive: 1 }).where(eq(trainingPlans.id, id)).run()
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
  // Replaces all PLANNED sessions with the new structure.
  // COMPLETED and SKIPPED sessions are collected first, then restored onto
  // any matching slot in the new structure (matched by phaseOrderIndex +
  // weekNumber + dayOfWeek). This preserves the user's run history.
  ipcMain.handle(
    IPC.PLANS_ADAPT,
    async (_e, payload: AdaptPlanPayload): Promise<IpcResponse<AdaptPlanResult>> => {
      try {
        const db     = getDb()
        const planId = payload.planId

        // ── 1. Snapshot completed / skipped sessions ──────────────────────────
        type SavedSession = {
          phaseOrderIndex: number
          weekNumber: number
          dayOfWeek: number
          status: 'completed' | 'skipped'
          completedAt: number | null
          completionNote: string | null
          linkedActivityId: number | null
        }

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
              .where(
                and(
                  eq(planSessions.weekId, week.id),
                  // Only save sessions that were acted on
                )
              )
              .all()
              .filter(s => s.status === 'completed' || s.status === 'skipped')

            for (const s of sessions) {
              savedSessions.push({
                phaseOrderIndex: phase.orderIndex,
                weekNumber:      week.weekNumber,
                dayOfWeek:       s.dayOfWeek,
                status:          s.status as 'completed' | 'skipped',
                completedAt:     s.completedAt     ?? null,
                completionNote:  s.completionNote  ?? null,
                linkedActivityId: s.linkedActivityId ?? null,
              })
            }
          }
        }

        // ── 2. Delete old phases (cascades → weeks → sessions) ─────────────────
        db.delete(planPhases).where(eq(planPhases.planId, planId)).run()

        // ── 3. Insert the new plan structure ───────────────────────────────────
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

        // ── 4. Restore completed / skipped onto matching new slots ─────────────
        let restored = 0
        for (const s of savedSessions) {
          const key       = `${s.phaseOrderIndex}:${s.weekNumber}:${s.dayOfWeek}`
          const sessionId = slotMap.get(key)
          if (!sessionId) continue   // no matching slot in new structure — history lost for this one

          db.update(planSessions)
            .set({
              status:          s.status,
              completedAt:     s.completedAt,
              completionNote:  s.completionNote,
              linkedActivityId: s.linkedActivityId,
            })
            .where(eq(planSessions.id, sessionId))
            .run()
          restored++
        }

        // ── 5. Update plan metadata ────────────────────────────────────────────
        db.update(trainingPlans)
          .set({
            name:      payload.name,
            goalEvent: payload.goalEvent ?? null,
            goalDate:  payload.goalDate  ?? null,
          })
          .where(eq(trainingPlans.id, planId))
          .run()

        markDirty()
        return {
          success: true,
          data: { preserved: savedSessions.length, restored },
        }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
