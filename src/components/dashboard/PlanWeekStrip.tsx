import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { PlanTodayResult, SessionRow } from '@/types/ipc'
import { addDaysStr, weekRange } from '@/shared/planCalendar'
import { DOW_SHORT, TONE_CLASS, TYPE_LABEL, fmtDate, statusLabel } from '@/components/plans/sessionFormat'
import { cn } from '@/lib/utils'

interface Props {
  data: PlanTodayResult
  onOpenSession: (s: SessionRow) => void
}

/** Mo–So der aktuellen Plan-Woche mit Datum, Kurz-Titel und Status-Punkt. */
export function PlanWeekStrip({ data, onOpenSession }: Props) {
  const navigate = useNavigate()
  const { plan, state, today, weekIndex, weekSessions } = data
  if (!plan || state !== 'running' || weekIndex === null) return null

  const { from } = weekRange(plan.startDate, weekIndex)

  return (
    <div className="mt-5 vspace-2">
      <div className="flex items-center gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">
          Diese Woche · Woche {weekIndex + 1} von {plan.weekCount}
        </p>
        <div className="flex-1" />
        <button
          onClick={() => navigate(`/plan/${plan.id}`)}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {plan.name} <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {DOW_SHORT.map((dow, i) => {
          const date = addDaysStr(from, i)
          const sessions = weekSessions.filter(s => s.dayOfWeek === i + 1)
          const first = sessions[0]
          const isToday = date === today
          const st = first ? statusLabel(first, today) : null
          return (
            <button
              key={dow}
              type="button"
              disabled={!first}
              onClick={() => first && onOpenSession(first)}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-left transition-colors min-w-0',
                first ? 'bg-card hover:bg-muted/60' : 'bg-muted/20 cursor-default',
                isToday && 'ring-2 ring-primary',
                first?.type === 'rest' && 'opacity-60',
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={cn('text-[10px] font-bold uppercase tabular-nums', isToday ? 'text-foreground' : 'text-muted-foreground')}>
                  {dow} {fmtDate(date, 'dd.MM.')}
                </span>
                {st && <span className={cn('h-2 w-2 rounded-full shrink-0', TONE_CLASS[st.tone].dot)} title={st.label} />}
              </div>
              <p className="mt-0.5 text-xs truncate">
                {first ? (first.title || TYPE_LABEL[first.type]) : <span className="text-muted-foreground/50">–</span>}
                {sessions.length > 1 && <span className="text-muted-foreground"> +{sessions.length - 1}</span>}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
