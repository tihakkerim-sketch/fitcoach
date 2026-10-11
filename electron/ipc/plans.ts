import { IPC } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { trainingPlans } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { todayLocal } from '../../src/shared/planCalendar'
import { getPlanDetail, getPlanToday, listPlans } from '../lib/planRead'
import {
  activatePlan, adaptPlan, createEmptyPlan, createPlan, createSession, deleteSession,
  linkSessionActivity, setSessionStatus, updatePlan, updateSession, updateWeek,
} from '../lib/planWrite'

// Dünne Hüllen: Logik (und Transaktionen) liegen in ../lib/planRead.ts und ../lib/planWrite.ts.
export function registerPlanHandlers() {
  handle(IPC.PLANS_CREATE, (p) => createPlan(getDb(), p))
  handle(IPC.PLANS_CREATE_EMPTY, (p) => createEmptyPlan(getDb(), p))
  handle(IPC.PLANS_UPDATE, (p) => updatePlan(getDb(), p))
  handle(IPC.PLANS_LIST, () => listPlans(getDb()))
  handle(IPC.PLANS_GET, (id) => getPlanDetail(getDb(), id))
  handle(IPC.PLANS_TODAY, () => getPlanToday(getDb(), todayLocal()))
  handle(IPC.PLANS_DELETE, (id) => {
    getDb().delete(trainingPlans).where(eq(trainingPlans.id, id)).run()
  })
  handle(IPC.PLANS_ACTIVATE, (id) => activatePlan(getDb(), id))
  handle(IPC.PLANS_ADAPT, (p) => adaptPlan(getDb(), p))

  handle(IPC.PLAN_WEEK_UPDATE, (p) => updateWeek(getDb(), p))

  handle(IPC.SESSIONS_CREATE, (p) => createSession(getDb(), p))
  handle(IPC.SESSIONS_UPDATE, (p) => updateSession(getDb(), p))
  handle(IPC.SESSIONS_DELETE, (id) => deleteSession(getDb(), id))
  handle(IPC.SESSIONS_UPDATE_STATUS, (p) => setSessionStatus(getDb(), p))
  handle(IPC.SESSIONS_LINK_ACTIVITY, (p) => linkSessionActivity(getDb(), p))
}
