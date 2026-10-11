import { IPC } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { todayLocal } from '../../src/shared/planCalendar'
import { getCoachStatus } from '../lib/coachData'
import { applyCoachChanges } from '../lib/coachChanges'

export function registerCoachHandlers() {
  handle(IPC.COACH_STATUS, () => getCoachStatus(getDb(), todayLocal()))
  handle(IPC.COACH_APPLY_CHANGES, (p) => applyCoachChanges(getDb(), p, todayLocal()))
}
