import { useEffect, useState } from 'react'
import { AlertCircle, Link2, Link2Off, Pencil, Trash2, Check, SkipForward, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { ActivityRow, SessionRow } from '@/types/ipc'
import { computeDeviation, type DeviationItem } from '@/shared/deviation'
import { addDaysStr, formatPace } from '@/shared/planCalendar'
import { SessionEditForm } from './SessionEditForm'
import {
  TYPE_LABEL, TYPE_ICON, TONE_CLASS, fmtDate, num, sessionTargetText, statusLabel, stepsText,
} from './sessionFormat'

interface Props {
  onClose: () => void
  /** Nach jeder Änderung: Daten neu laden. */
  onChanged: () => void
  plan: { id: number; weekCount: number }
  /** Vorhandene Einheit anzeigen … */
  session: SessionRow | null
  /** … oder an dieser Stelle eine neue anlegen. */
  create: { weekIndex: number; dayOfWeek: number } | null
  today: string
}

type Mode = 'view' | 'edit' | 'pick'

const ACTIVITY_LABEL: Record<string, string> = {
  running: 'Lauf', cycling: 'Rad', strength: 'Kraft', custom: 'Sonstiges', sleep: 'Schlaf',
}

const signed = (pct: number) => (pct > 0 ? `+${pct}` : pct < 0 ? `−${Math.abs(pct)}` : '±0')

function deviationLine(d: DeviationItem): string {
  const p = `(${signed(d.pct)} %)`
  switch (d.field) {
    case 'distance': return `Distanz ${num(d.planned)} km → ${num(d.actual)} km ${p}`
    case 'duration': return `Dauer ${num(d.planned)} min → ${num(d.actual)} min ${p}`
    default: return `Pace ${formatPace(d.planned)}/km → ${formatPace(d.actual)}/km ${p}`
  }
}

/** Dialog zu einer Plan-Einheit: Ansicht, Status, Zuordnung, Bearbeiten, Löschen – oder Anlegen. */
export function SessionDialog({ onClose, onChanged, plan, session, create, today }: Props) {
  const [mode, setMode] = useState<Mode>(session ? 'view' : 'edit')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setError(null)
    try {
      await fn()
      onChanged()
      after?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const setStatus = (status: 'completed' | 'skipped' | 'planned') =>
    run(() => invoke(IPC.SESSIONS_UPDATE_STATUS, { sessionId: session!.id, status }))

  const unlink = () =>
    run(() => invoke(IPC.SESSIONS_LINK_ACTIVITY, { sessionId: session!.id, activityId: null }))

  const remove = () =>
    run(() => invoke(IPC.SESSIONS_DELETE, session!.id), onClose)

  const initial = session
    ? { weekIndex: session.weekIndex, dayOfWeek: session.dayOfWeek }
    : create ?? { weekIndex: 0, dayOfWeek: 1 }

  const title = session
    ? fmtDate(session.date, 'EEEE, dd.MM.yyyy')
    : mode === 'edit' ? 'Neue Einheit' : ''

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {mode === 'edit' && (
          <SessionEditForm
            plan={plan}
            session={session}
            initial={initial}
            onCancel={() => (session ? setMode('view') : onClose())}
            onSaved={() => { onChanged(); if (session) setMode('view'); else onClose() }}
          />
        )}

        {mode === 'pick' && session && (
          <ActivityPicker
            session={session}
            onCancel={() => setMode('view')}
            onPick={id => run(
              () => invoke(IPC.SESSIONS_LINK_ACTIVITY, { sessionId: session.id, activityId: id }),
              () => setMode('view'),
            )}
            busy={busy}
          />
        )}

        {mode === 'view' && session && (
          <SessionView
            session={session}
            today={today}
            busy={busy}
            confirmDelete={confirmDelete}
            onConfirmDelete={setConfirmDelete}
            onStatus={setStatus}
            onUnlink={unlink}
            onPick={() => setMode('pick')}
            onEdit={() => setMode('edit')}
            onDelete={remove}
          />
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Ansicht ───────────────────────────────────────────────────────────────────

interface ViewProps {
  session: SessionRow
  today: string
  busy: boolean
  confirmDelete: boolean
  onConfirmDelete: (v: boolean) => void
  onStatus: (s: 'completed' | 'skipped' | 'planned') => void
  onUnlink: () => void
  onPick: () => void
  onEdit: () => void
  onDelete: () => void
}

function SessionView({ session: s, today, busy, confirmDelete, onConfirmDelete, onStatus, onUnlink, onPick, onEdit, onDelete }: ViewProps) {
  const { label, tone } = statusLabel(s, today)
  const Icon = TYPE_ICON[s.type]
  const target = sessionTargetText(s)
  const lines = s.steps && s.steps.length ? stepsText(s.steps) : []
  const a = s.activity
  const deviation = a ? computeDeviation(s, a) : []
  const actualPace = a && a.distanceKm && a.durationMin ? (a.durationMin * 60) / a.distanceKm : null

  return (
    <div className="vspace-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">{s.title || TYPE_LABEL[s.type]}</span>
        <Badge variant="outline" className="text-xs">{TYPE_LABEL[s.type]}</Badge>
        <span className={`text-xs font-semibold ${TONE_CLASS[tone].text}`}>{label}</span>
      </div>

      {target && <p className="text-sm tabular-nums">{target}</p>}

      {lines.length > 0 && (
        <ul className="rounded-lg border bg-muted/30 p-3 text-sm vspace-1">
          {lines.map((l, i) => <li key={i} className="tabular-nums">{l}</li>)}
        </ul>
      )}

      {s.coachingNote && (
        <p className="text-sm text-muted-foreground border-l-2 pl-3">{s.coachingNote}</p>
      )}

      {a && (
        <div className="rounded-lg border bg-card p-3 vspace-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">
              Verknüpfte Aktivität · {ACTIVITY_LABEL[a.type] ?? a.type} am {fmtDate(a.date, 'dd.MM.yyyy')}
            </span>
            <Badge variant="secondary" className="text-xs">
              {s.matchSource === 'auto' ? 'automatisch zugeordnet' : 'manuell zugeordnet'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {[
              a.distanceKm != null ? `${num(a.distanceKm)} km` : null,
              a.durationMin != null ? `${num(a.durationMin)} min` : null,
              actualPace ? `${formatPace(actualPace)}/km` : null,
              a.avgHr != null ? `Ø ${a.avgHr} bpm` : null,
            ].filter(Boolean).join(' · ')}
          </p>
          {deviation.length > 0 && (
            <ul className="text-sm vspace-0.5 tabular-nums">
              {deviation.map(d => <li key={d.field}>{deviationLine(d)}</li>)}
            </ul>
          )}
        </div>
      )}

      {s.status === 'completed' && !a && (
        <p className="text-xs text-muted-foreground">Manuell als erledigt markiert (keine Aktivität verknüpft).</p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {s.status === 'planned' ? (
          <>
            <Button size="sm" onClick={() => onStatus('completed')} disabled={busy} className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Erledigt
            </Button>
            <Button size="sm" variant="outline" onClick={() => onStatus('skipped')} disabled={busy} className="gap-1.5">
              <SkipForward className="h-3.5 w-3.5" /> Übersprungen
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onStatus('planned')} disabled={busy} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Zurücksetzen
          </Button>
        )}
        {a ? (
          <Button size="sm" variant="outline" onClick={onUnlink} disabled={busy} className="gap-1.5">
            <Link2Off className="h-3.5 w-3.5" /> Zuordnung lösen
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onPick} disabled={busy} className="gap-1.5">
          <Link2 className="h-3.5 w-3.5" /> Lauf wählen
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit} disabled={busy} className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> Bearbeiten
        </Button>
        {confirmDelete ? (
          <span className="flex items-center gap-2 ml-auto text-sm">
            Wirklich löschen?
            <Button size="sm" variant="destructive" onClick={onDelete} disabled={busy}>Ja, löschen</Button>
            <Button size="sm" variant="ghost" onClick={() => onConfirmDelete(false)} disabled={busy}>Nein</Button>
          </span>
        ) : (
          <Button
            size="sm" variant="ghost" onClick={() => onConfirmDelete(true)} disabled={busy}
            className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Löschen
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Aktivität wählen ──────────────────────────────────────────────────────────

function ActivityPicker({ session, onPick, onCancel, busy }: {
  session: SessionRow
  onPick: (activityId: number) => void
  onCancel: () => void
  busy: boolean
}) {
  const [items, setItems] = useState<ActivityRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    invoke(IPC.ACTIVITIES_LIST, {
      dateFrom: addDaysStr(session.date, -3),
      dateTo: addDaysStr(session.date, 3),
      sortBy: 'date',
      sortDir: 'asc',
    })
      .then(r => { if (!cancelled) setItems(r.activities.filter(x => x.type !== 'sleep')) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [session.date])

  return (
    <div className="vspace-3">
      <p className="text-sm text-muted-foreground">
        Aktivitäten vom {fmtDate(addDaysStr(session.date, -3), 'dd.MM.')} bis {fmtDate(addDaysStr(session.date, 3), 'dd.MM.yyyy')}.
        Hängt ein Lauf schon an einer anderen Einheit, wird diese wieder frei.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!items && !error && <p className="text-sm text-muted-foreground">Wird geladen …</p>}
      {items && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Keine Aktivitäten in diesem Zeitraum.</p>
      )}
      <div className="vspace-1.5">
        {items?.map(x => (
          <button
            key={x.id}
            type="button"
            disabled={busy}
            onClick={() => onPick(x.id)}
            className="w-full flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-muted/60 transition-colors disabled:opacity-50"
          >
            <span className="font-medium">{ACTIVITY_LABEL[x.type] ?? x.type} · {fmtDate(x.date, 'EEE dd.MM.')}</span>
            <span className="text-muted-foreground tabular-nums">
              {[
                x.distanceKm != null ? `${num(x.distanceKm)} km` : null,
                x.durationMin != null ? `${num(x.durationMin)} min` : null,
              ].filter(Boolean).join(' · ')}
            </span>
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onCancel} disabled={busy}>Zurück</Button>
      </div>
    </div>
  )
}
