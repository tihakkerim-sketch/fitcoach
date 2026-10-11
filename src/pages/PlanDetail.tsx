import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Zap, GitBranch, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PlanCalendar } from '@/components/plans/PlanCalendar'
import { AdaptPlanModal } from '@/components/plans/AdaptPlanModal'
import { SessionDialog } from '@/components/plans/SessionDialog'
import { PlanSettingsDialog } from '@/components/plans/PlanSettingsDialog'
import { fmtDate, statusLabel } from '@/components/plans/sessionFormat'
import { usePlanDetail } from '@/hooks/usePlanDetail'
import { useToast } from '@/contexts/ToastContext'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import { currentWeekIndex, planEndDate, planState, todayLocal } from '@/shared/planCalendar'

type Dialog =
  | { kind: 'session'; sessionId: number }
  | { kind: 'create'; weekIndex: number; dayOfWeek: number }
  | null

export default function PlanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const planId = id ? parseInt(id, 10) : null
  const { plan, loading, error, refresh } = usePlanDetail(planId)
  const [adaptOpen, setAdaptOpen] = useState(false)
  const [settings, setSettings] = useState<'start' | 'weeks' | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  const today = todayLocal()

  const stats = useMemo(() => {
    if (!plan) return null
    const sessions = plan.weeks.flatMap(w => w.sessions)
    const trainable = sessions.filter(s => s.type !== 'rest')
    const completed = trainable.filter(s => s.status === 'completed').length
    const skipped = trainable.filter(s => s.status === 'skipped').length
    const missed = trainable.filter(s => statusLabel(s, today).label === 'verpasst').length
    const decided = completed + skipped + missed
    return {
      total: sessions.length, completed, skipped, missed, decided,
      adherencePct: decided > 0 ? Math.round((completed / decided) * 100) : null,
    }
  }, [plan, today])

  if (loading) {
    return <div className="p-6 text-muted-foreground">Wird geladen …</div>
  }

  if (error && !plan) {
    return <div className="p-6 text-destructive">{error}</div>
  }

  if (!plan || !stats) {
    return (
      <div className="p-6 vspace-3">
        <p className="text-muted-foreground">Plan nicht gefunden.</p>
        <Button variant="outline" onClick={() => navigate('/plan')}>← Zurück zu den Plänen</Button>
      </div>
    )
  }

  const state = planState(plan.startDate, plan.weekCount, today)
  const stateText =
    state === 'running' ? `Woche ${currentWeekIndex(plan.startDate, today) + 1} von ${plan.weekCount}`
    : state === 'before' ? `startet am ${fmtDate(plan.startDate)}`
    : 'beendet'

  const openSession = dialog?.kind === 'session'
    ? plan.weeks.flatMap(w => w.sessions).find(s => s.id === dialog.sessionId) ?? null
    : null

  const activate = async () => {
    if (!confirm(`„${plan.name}“ zum aktiven Plan machen? Ein anderer aktiver Plan wird archiviert.`)) return
    try {
      await invoke(IPC.PLANS_ACTIVATE, plan.id)
      refresh()
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Aktivieren fehlgeschlagen', duration: 6000 })
    }
  }

  const pctColor = (p: number) => (p >= 80 ? '#22c55e' : p >= 50 ? '#f59e0b' : '#ef4444')

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b px-6 py-4 vspace-2">
        <Button variant="ghost" size="sm" className="mb-1 -ml-2 text-muted-foreground" onClick={() => navigate('/plan')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Alle Pläne
        </Button>

        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold">{plan.name}</h1>
          {plan.isActive ? <Badge>Aktiv</Badge> : <Badge variant="outline">Archiv</Badge>}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {!plan.isActive && (
              <Button size="sm" onClick={activate}>Aktivieren</Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setSettings('start')}>Startdatum ändern</Button>
            <Button variant="outline" size="sm" onClick={() => setSettings('weeks')}>Wochen: {plan.weekCount}</Button>
            <Button variant="outline" size="sm" onClick={() => setAdaptOpen(true)} className="gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              Mit Claude anpassen
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5 tabular-nums">
            <CalendarDays className="h-3.5 w-3.5" />
            {fmtDate(plan.startDate)} – {fmtDate(planEndDate(plan.startDate, plan.weekCount))}
          </span>
          <span className="font-medium text-foreground">{stateText}</span>
          {plan.goalEvent && (
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" />{plan.goalEvent}</span>
          )}
          {plan.goalDate && (
            <span className="flex items-center gap-1.5 tabular-nums"><Flag className="h-3.5 w-3.5" />{fmtDate(plan.goalDate)}</span>
          )}
          <span className="tabular-nums">{stats.total} {stats.total === 1 ? 'Einheit' : 'Einheiten'}</span>
          {stats.total > 0 && (
            <span className="tabular-nums">
              <span className="text-green-600 dark:text-green-400">{stats.completed} erledigt</span>
              {stats.skipped > 0 && <span> · {stats.skipped} übersprungen</span>}
              {stats.missed > 0 && <span className="text-red-600 dark:text-red-400"> · {stats.missed} verpasst</span>}
            </span>
          )}
        </div>

        {stats.adherencePct !== null && (
          <div className="mt-4 vspace-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Plantreue</p>
              <span className="text-sm font-bold tabular-nums" style={{ color: pctColor(stats.adherencePct) }}>
                {stats.adherencePct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.adherencePct}%`, background: pctColor(stats.adherencePct) }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {stats.completed} von {stats.decided} bisher fälligen Einheiten erledigt
            </p>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="px-6 py-4">
          <PlanCalendar
            plan={plan}
            today={today}
            onOpenSession={s => setDialog({ kind: 'session', sessionId: s.id })}
            onCreate={(weekIndex, dayOfWeek) => setDialog({ kind: 'create', weekIndex, dayOfWeek })}
            onChanged={refresh}
          />
        </div>
      </ScrollArea>

      {dialog?.kind === 'session' && openSession && (
        <SessionDialog
          key={openSession.id}
          plan={plan}
          session={openSession}
          create={null}
          today={today}
          onChanged={refresh}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'create' && (
        <SessionDialog
          plan={plan}
          session={null}
          create={{ weekIndex: dialog.weekIndex, dayOfWeek: dialog.dayOfWeek }}
          today={today}
          onChanged={refresh}
          onClose={() => setDialog(null)}
        />
      )}

      {settings && (
        <PlanSettingsDialog
          mode={settings}
          plan={plan}
          onSaved={refresh}
          onClose={() => setSettings(null)}
        />
      )}

      {planId && (
        <AdaptPlanModal
          open={adaptOpen}
          onClose={() => setAdaptOpen(false)}
          onSaved={refresh}
          planId={planId}
          planName={plan.name}
        />
      )}
    </div>
  )
}
