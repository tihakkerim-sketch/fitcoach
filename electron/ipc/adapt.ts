import { IPC } from '../../src/types/ipc'
import { handle } from './handle'
import { getDb } from '../../db/index'
import { appToday } from '../lib/today'
import {
  applyProposal, createNotFullProposal, getPaceStatus, listOpenProposals, listPendingFeedback,
  rejectProposal, saveFeedback, setPerformance,
} from '../lib/planProposals'

export function registerAdaptHandlers() {
  handle(IPC.ADAPT_PENDING_FEEDBACK, () => listPendingFeedback(getDb(), appToday(getDb())))
  handle(IPC.ADAPT_FEEDBACK, (p) => saveFeedback(getDb(), p, appToday(getDb()), Date.now()))
  handle(IPC.ADAPT_PROPOSALS, () => listOpenProposals(getDb()))
  handle(IPC.ADAPT_APPLY, ({ id }) => applyProposal(getDb(), id, appToday(getDb()), Date.now()))
  handle(IPC.ADAPT_REJECT, ({ id }) => rejectProposal(getDb(), id, Date.now()))
  handle(IPC.ADAPT_NOT_FULL, (p) => createNotFullProposal(getDb(), p, appToday(getDb()), Date.now()))
  handle(IPC.ADAPT_PACE_STATUS, () => getPaceStatus(getDb(), appToday(getDb())))
  handle(IPC.ADAPT_SET_PERFORMANCE, (p) => setPerformance(getDb(), p, appToday(getDb()), Date.now()))
}
