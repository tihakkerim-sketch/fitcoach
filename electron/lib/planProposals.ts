/**
 * Plan-Vorschläge: Feedback speichern, Vorschläge erzeugen (Regeln aus `src/shared/adapt`),
 * übernehmen (über `applyCoachChanges`, eine Transaktion) oder ablehnen; Leistungszahl.
 * Höchstens ein offener Vorschlag je Art. Ohne `electron`-Import.
 */
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { format } from 'date-fns'
import { activities, planProposals, userProfile } from '../../db/schema'
import {
  adaptAfterRun, notFullProposal, paceCheck, scalePaces, to10kSec,
  type AdaptResult, type CoachChange, type NotFullReason, type PaceStatusView, type PendingFeedback,
  type ProposalKind, type ProposalView, type Reason,
} from '../../src/shared/adapt'

export type { PaceStatusView, PendingFeedback, ProposalKind, ProposalView }
import { predictRace } from '../../src/shared/coach'
import { addDaysStr } from '../../src/shared/planCalendar'
import { loadAdaptInput, toAdaptSession } from './adaptData'
import { applyCoachChanges } from './coachChanges'
import { getActivePlanDetail, loadProfile, toCoachActivity } from './coachData'
import { runInTransaction, type TxDb } from './transaction'

export interface FeedbackInput {
  activityId: number
  effort: number | null
  pain: boolean
  notes: string | null
  skipped: boolean
}


type ProposalRow = typeof planProposals.$inferSelect

const parse = <T>(text: string, fallback: T): T => {
  try { return JSON.parse(text) as T } catch { return fallback }
}

function toView(r: ProposalRow): ProposalView {
  return {
    id: r.id, kind: r.kind as ProposalKind, createdAt: r.createdAt,
    changes: parse<CoachChange[]>(r.changes, []), reasons: parse<Reason[]>(r.reasons, []),
    meta: parse<Record<string, unknown>>(r.meta, {}),
  }
}

/** Neuen offenen Vorschlag speichern; vorhandene offene derselben Art werden `stale`. */
function storeProposal(
  db: TxDb, planId: number, kind: ProposalKind, r: AdaptResult, now: number,
  extra: { activityId?: number | null; meta?: Record<string, unknown> } = {},
): ProposalView | null {
  if (r.changes.length === 0) return null
  return runInTransaction(db, () => {
    db.update(planProposals).set({ status: 'stale', resolvedAt: now })
      .where(and(eq(planProposals.status, 'open'), eq(planProposals.kind, kind))).run()
    const row = db.insert(planProposals).values({
      planId, activityId: extra.activityId ?? null, kind, meta: JSON.stringify(extra.meta ?? {}),
      changes: JSON.stringify(r.changes), reasons: JSON.stringify(r.reasons), createdAt: now,
    }).returning().get()
    return toView(row)
  })
}

/** Zugeordnete Läufe des aktiven Plans ohne Feedback aus den letzten 3 Tagen, ältester zuerst. */
export function listPendingFeedback(db: TxDb, today: string): PendingFeedback[] {
  const plan = getActivePlanDetail(db)
  if (!plan) return []
  const from = addDaysStr(today, -2)
  const sessions = plan.weeks.flatMap(w => w.sessions).filter(s => s.linkedActivityId !== null)
  const ids = sessions.map(s => s.linkedActivityId as number)
  if (ids.length === 0) return []
  const rows = db.select().from(activities)
    .where(and(inArray(activities.id, ids), isNull(activities.feedbackAt), gte(activities.date, from), lte(activities.date, today)))
    .all()
  return rows
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.id - b.id)
    .map(a => ({
      activityId: a.id, date: a.date, distanceKm: a.distanceKm,
      sessionTitle: sessions.find(s => s.linkedActivityId === a.id)?.title ?? null,
    }))
}

/** Datum der letzten übernommenen Leistungs-Änderung (für den Leistungs-Check). */
function lastPaceChangeDate(db: TxDb): string | null {
  const row = db.select({ at: planProposals.resolvedAt }).from(planProposals)
    .where(and(eq(planProposals.kind, 'pace'), eq(planProposals.status, 'applied')))
    .orderBy(desc(planProposals.resolvedAt)).get()
  return row?.at ? format(new Date(row.at), 'yyyy-MM-dd') : null
}

export function saveFeedback(db: TxDb, p: FeedbackInput, today: string, now: number): ProposalView[] {
  db.update(activities).set(p.skipped
    ? { feedbackAt: now }
    : { feedbackAt: now, perceivedEffort: p.effort, pain: p.pain ? 1 : 0, notes: p.notes })
    .where(eq(activities.id, p.activityId)).run()

  const loaded = loadAdaptInput(db, today)
  if (!loaded) return []
  const { planId, input } = loaded
  const run = input.recent.find(f => f.activityId === p.activityId)
  if (!run) return []

  const created: ProposalView[] = []
  const runProposal = storeProposal(db, planId, 'run', adaptAfterRun(input, run), now, { activityId: p.activityId })
  if (runProposal) created.push(runProposal)

  const current = loadProfile(db)?.current10kSec ?? null
  const check = paceCheck(input.recent, current, lastPaceChangeDate(db), today)
  if ((check.state === 'faster' || check.state === 'slower') && current && check.new10kSec) {
    const all = getActivePlanDetail(db)!.weeks.flatMap(w => w.sessions).map(toAdaptSession) // ganzer restlicher Plan
    const pace = storeProposal(db, planId, 'pace', scalePaces(all, today, check.new10kSec / current), now,
      { activityId: p.activityId, meta: { old10kSec: current, new10kSec: check.new10kSec } })
    if (pace) created.push(pace)
  }
  return created
}

export function createNotFullProposal(
  db: TxDb, p: { reason: NotFullReason; days: number }, today: string, now: number,
): ProposalView | null {
  const loaded = loadAdaptInput(db, today)
  if (!loaded) return null
  return storeProposal(db, loaded.planId, 'not_full', notFullProposal(loaded.input, p.reason, p.days), now,
    { meta: { reason: p.reason, days: p.days } })
}

export function listOpenProposals(db: TxDb): ProposalView[] {
  return db.select().from(planProposals).where(eq(planProposals.status, 'open'))
    .orderBy(desc(planProposals.createdAt), desc(planProposals.id)).all().map(toView)
}

function setCurrent10k(db: TxDb, sec: number): void {
  if (loadProfile(db)) db.update(userProfile).set({ current10kSec: sec }).where(eq(userProfile.id, 1)).run()
  else db.insert(userProfile).values({ id: 1, current10kSec: sec }).run()
}

export function applyProposal(db: TxDb, id: number, today: string, now: number): { status: 'applied' | 'stale' } {
  const row = db.select().from(planProposals).where(eq(planProposals.id, id)).get()
  if (!row || row.status !== 'open') throw new Error('Dieser Vorschlag ist nicht mehr offen.')
  const p = toView(row)
  try {
    runInTransaction(db, () => {
      applyCoachChanges(db, { planId: row.planId, changes: p.changes }, today)
      const next = p.meta.new10kSec
      if (p.kind === 'pace' && typeof next === 'number') setCurrent10k(db, next)
      db.update(planProposals).set({ status: 'applied', resolvedAt: now }).where(eq(planProposals.id, id)).run()
    })
    return { status: 'applied' }
  } catch {
    db.update(planProposals).set({ status: 'stale', resolvedAt: now }).where(eq(planProposals.id, id)).run()
    return { status: 'stale' }
  }
}

export function rejectProposal(db: TxDb, id: number, now: number): void {
  db.update(planProposals).set({ status: 'rejected', resolvedAt: now })
    .where(and(eq(planProposals.id, id), eq(planProposals.status, 'open'))).run()
}

export function getPaceStatus(db: TxDb, today: string): PaceStatusView {
  const loaded = loadAdaptInput(db, today)
  const current = loadProfile(db)?.current10kSec ?? null
  const check = paceCheck(loaded?.input.recent ?? [], current, lastPaceChangeDate(db), today)

  let suggested10kSec: number | null = null
  if (current == null) {
    const acts = db.select().from(activities)
      .where(and(gte(activities.date, addDaysStr(today, -83)), lte(activities.date, today))).all().map(toCoachActivity)
    suggested10kSec = predictRace(acts, today, { km: 10, label: '10 km' }, null)?.predictedSec ?? null
  }

  const history = db.select().from(planProposals)
    .where(and(eq(planProposals.kind, 'pace'), eq(planProposals.status, 'applied')))
    .orderBy(desc(planProposals.resolvedAt)).all()
    .map(r => ({ at: r.resolvedAt ?? r.createdAt, sec: Number(parse<Record<string, unknown>>(r.meta, {}).new10kSec) }))
    .filter(h => Number.isFinite(h.sec))

  return { ...check, suggested10kSec, history }
}

/**
 * Leistung von Hand setzen: auf 10 km umrechnen, speichern und vorhandene Tempo-Ziele ab heute
 * mit neu/alt skalieren. Mit aktivem Plan wird die Änderung als übernommener Tempo-Vorschlag
 * protokolliert (Verlauf + Startpunkt des nächsten Leistungs-Checks).
 */
export function setPerformance(
  db: TxDb, p: { distanceKm: number; timeSec: number }, today: string, now: number,
): { current10kSec: number; scaled: number } {
  const next = to10kSec(p.timeSec, p.distanceKm)
  return runInTransaction(db, () => {
    const prev = loadProfile(db)?.current10kSec ?? null
    const loaded = loadAdaptInput(db, today)
    let scaled = 0
    if (prev && loaded) {
      const plan = getActivePlanDetail(db)!
      const all = plan.weeks.flatMap(w => w.sessions).map(toAdaptSession) // ganzer restlicher Plan
      const { changes } = scalePaces(all, today, next / prev)
      if (changes.length) applyCoachChanges(db, { planId: loaded.planId, changes }, today)
      scaled = changes.length
      db.insert(planProposals).values({
        planId: loaded.planId, kind: 'pace', status: 'applied', resolvedAt: now, createdAt: now,
        meta: JSON.stringify({ old10kSec: prev, new10kSec: next, manual: true }),
        changes: JSON.stringify(changes),
        reasons: JSON.stringify([{ rule: 'PACE', text: 'Leistung von Hand geändert – Tempo-Ziele angepasst.' }]),
      }).run()
    }
    setCurrent10k(db, next)
    return { current10kSec: next, scaled }
  })
}

