import { IPC } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { appToday } from '../lib/today'
import { getCoachStatus } from '../lib/coachData'
import { applyCoachChanges } from '../lib/coachChanges'

export function registerCoachHandlers() {
  handle(IPC.COACH_STATUS, () => getCoachStatus(getDb(), appToday(getDb())))
  handle(IPC.COACH_APPLY_CHANGES, (p) => applyCoachChanges(getDb(), p, appToday(getDb())))
}
