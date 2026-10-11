import { useNavigate } from 'react-router-dom'
import { CalendarDays, CalendarClock, CalendarCheck, Moon } from 'lucide-react'
import type { PlanTodayResult, SessionRow } from '@/types/ipc'
import { computeDeviation } from '@/shared/deviation'
import { planEndDate } from '@/shared/planCalendar'
import {
  TYPE_ICON, TYPE_LABEL, TONE_CLASS, deviationLine, fmtDate, num, sessionTargetText, statusLabel, stepsText,
} from '@/components/plans/sessionFormat'
import { cn } from '@/lib/utils'

interface Props {
  data: PlanTodayResult
  onOpenSession: (s: SessionRow) => void
}

function InfoCard({ icon: Icon, title, text, action, onAction }: {
  icon: typeof CalendarDays; title: string; text?: string; action: string; onAction: () => void
}) {
  return (
    <button
      onClick={onAction}
      className="group w-full flex items-center gap-4 rounded-xl border border-dashed border-border bg-card p-5 text-left hover:border-primary/40 transition-all"
    >
      <div className="w-11 h-11 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-violet-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{title}</p>
        {text && <p className="text-xs text-muted-foreground mt-0.5">{text}</p>}
        <p className="text-xs text-primary mt-1">{action} →</p>
      </div>
    </button>
  )
}

function TodaySession({ s, today, onOpen }: { s: SessionRow; today: string; onOpen: () => void }) {
  const { label, tone } = statusLabel(s, today)
  const Icon = TYPE_ICON[s.type]
  const target = sessionTargetText(s)
  const lines = s.steps && s.steps.length ? stepsText(s.steps) : []
  const a = s.activity
  const deviation = a ? computeDeviation(s, a) : []
  const isRest = s.type === 'rest'

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-colors hover:brightness-95 dark:hover:brightness-125',
        TONE_CLASS[tone].card,
        isRest && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
          <Icon className={cn('h-4 w-4', TONE_CLASS[tone].text)} />
        </div>
        <div className="flex-1 min-w-0 vspace-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{s.title || TYPE_LABEL[s.type]}</span>
            {s.title && <span className="text-xs text-muted-foreground">{TYPE_LABEL[s.type]}</span>}
            {!isRest && (
              <span className={cn('ml-auto text-xs font-semibold', TONE_CLASS[tone].text)}>{label}</span>
            )}
          </div>
          {target && <p className="text-sm text-muted-foreground tabular-nums">{target}</p>}
          {lines.length > 0 && (
            <ul className="text-xs text-muted-foreground tabular-nums">
              {lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
          {s.coachingNote && (
            <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-3 leading-relaxed">
              {s.coachingNote}
            </p>
          )}
          {a && (
            <div className="pt-1 text-xs vspace-0.5">
              <p className="font-medium tabular-nums">
                Lauf: {[
                  a.distanceKm != null ? `${num(a.distanceKm)} km` : null,
                  a.durationMin != null ? `${num(a.durationMin)} min` : null,
                  a.avgHr != null ? `Ø ${a.avgHr} bpm` : null,
                ].filter(Boolean).join(' · ')}
              </p>
              {deviation.map(d => (
                <p key={d.field} className="text-muted-foreground tabular-nums">{deviationLine(d)}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

/** „Heute"-Karte des Dashboards: je nach Plan-Zustand Hinweis oder die heutigen Einheiten. */
export function TodayPlanCard({ data, onOpenSession }: Props) {
  const navigate = useNavigate()
  const { plan, state, today } = data

  if (state === 'none' || !plan) {
    return (
      <InfoCard
        icon={CalendarDays}
        title="Kein aktiver Plan"
        text="Lege einen Plan an oder importiere einen von Claude."
        action="Plan anlegen"
        onAction={() => navigate('/plan')}
      />
    )
  }
  if (state === 'before') {
    return (
      <InfoCard
        icon={CalendarClock}
        title={`Plan „${plan.name}“ startet am ${fmtDate(plan.startDate)}`}
        action="Plan ansehen"
        onAction={() => navigate(`/plan/${plan.id}`)}
      />
    )
  }
  if (state === 'finished') {
    return (
      <InfoCard
        icon={CalendarCheck}
        title={`Plan beendet am ${fmtDate(planEndDate(plan.startDate, plan.weekCount))}`}
        text={`„${plan.name}“`}
        action="Zur Plan-Liste"
        onAction={() => navigate('/plan')}
      />
    )
  }

  return (
    <div className="rounded-xl border-2 border-primary/40 bg-card overflow-hidden">
      <div className="p-5 vspace-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Heute · {fmtDate(today, 'EEEE dd.MM.')}
        </p>
        {data.todaySessions.length === 0 ? (
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-slate-500/10 flex items-center justify-center shrink-0">
              <Moon className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <p className="font-semibold">Heute ist frei</p>
              <p className="text-xs text-muted-foreground mt-0.5">{plan.name} · Keine Einheit geplant. Erhol dich gut.</p>
            </div>
          </div>
        ) : (
          <div className="vspace-2">
            {data.todaySessions.map(s => (
              <TodaySession key={s.id} s={s} today={today} onOpen={() => onOpenSession(s)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
