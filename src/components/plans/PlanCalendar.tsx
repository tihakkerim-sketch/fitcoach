import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/contexts/ToastContext'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { PlanDetail, SessionRow, WeekDetail } from '@/types/ipc'
import { addDaysStr, currentWeekIndex } from '@/shared/planCalendar'
import {
  DOW_SHORT, TYPE_ICON, TYPE_LABEL, TONE_CLASS, fmtDate, num, sessionTargetText, statusLabel,
} from './sessionFormat'
import { cn } from '@/lib/utils'

interface Props {
  plan: PlanDetail
  today: string
  onOpenSession: (s: SessionRow) => void
  onCreate: (weekIndex: number, dayOfWeek: number) => void
  onChanged: () => void
}

function weekKm(week: WeekDetail) {
  const planned = week.sessions
    .filter(s => s.type === 'running')
    .reduce((sum, s) => sum + (s.targetDistanceKm ?? 0), 0)
  const actual = week.sessions
    .filter(s => s.status === 'completed' && s.activity)
    .reduce((sum, s) => sum + (s.activity?.distanceKm ?? 0), 0)
  return { planned, actual }
}

function SessionChip({ s, today, onClick }: { s: SessionRow; today: string; onClick: () => void }) {
  const { label, tone } = statusLabel(s, today)
  const Icon = TYPE_ICON[s.type]
  const target = sessionTargetText(s)
  const isRest = s.type === 'rest'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:brightness-95 dark:hover:brightness-125',
        TONE_CLASS[tone].card,
        tone === 'primary' && 'border-primary',
        isRest && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3 w-3 shrink-0', TONE_CLASS[tone].text)} />
        <span className="font-medium truncate">{s.title || TYPE_LABEL[s.type]}</span>
      </div>
      {target && <div className="mt-0.5 text-muted-foreground tabular-nums truncate">{target}</div>}
      {!isRest && label !== 'geplant' && (
        <div className={cn('mt-0.5 font-semibold', TONE_CLASS[tone].text)}>{label}</div>
      )}
    </button>
  )
}

function WeekHeaderEditor({ week, onDone }: { week: WeekDetail; onDone: (changed: boolean) => void }) {
  const { toast } = useToast()
  const [phase, setPhase] = useState(week.phase ?? '')
  const [notes, setNotes] = useState(week.notes ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await invoke(IPC.PLAN_WEEK_UPDATE, { weekId: week.id, phase: phase.trim() || null, notes: notes.trim() || null })
      onDone(true)
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Speichern fehlgeschlagen', duration: 6000 })
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="h-8 w-44 text-xs" placeholder="Phase" value={phase} onChange={e => setPhase(e.target.value)} />
      <Input className="h-8 w-64 text-xs" placeholder="Notiz zur Woche" value={notes} onChange={e => setNotes(e.target.value)} />
      <Button size="sm" className="h-8" onClick={save} disabled={saving}>Speichern</Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={() => onDone(false)} disabled={saving}>Abbrechen</Button>
    </div>
  )
}

export function PlanCalendar({ plan, today, onOpenSession, onCreate, onChanged }: Props) {
  const curRef = useRef<HTMLDivElement | null>(null)
  const [editingWeek, setEditingWeek] = useState<number | null>(null)
  const current = currentWeekIndex(plan.startDate, today)

  // Beim ersten Anzeigen zur aktuellen Woche scrollen
  useEffect(() => {
    const t = setTimeout(() => curRef.current?.scrollIntoView({ block: 'center' }), 50)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="vspace-3">
      {plan.weeks.map(week => {
        const isCurrent = week.weekIndex === current
        const { planned, actual } = weekKm(week)
        const editing = editingWeek === week.id
        return (
          <div
            key={week.id}
            ref={isCurrent ? curRef : undefined}
            className={cn(
              'rounded-lg border p-3 vspace-2 @container',
              isCurrent ? 'border-primary/60 bg-primary/5' : 'bg-card',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                <span className="font-semibold text-sm">Woche {week.weekIndex + 1}</span>
                {isCurrent && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">aktuell</span>
                )}
                {!editing && week.phase && <span className="text-sm text-muted-foreground">· {week.phase}</span>}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtDate(week.from, 'dd.MM.')}–{fmtDate(week.to, 'dd.MM.')}
                </span>
                {!editing && (
                  <Button
                    variant="ghost" size="sm" className="h-6 px-1.5 text-muted-foreground"
                    title="Phase und Notiz bearbeiten" onClick={() => setEditingWeek(week.id)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {(planned > 0 || actual > 0) && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  Soll {num(planned)} km / Ist {num(actual)} km
                </span>
              )}
            </div>

            {editing && (
              <WeekHeaderEditor
                week={week}
                onDone={changed => { setEditingWeek(null); if (changed) onChanged() }}
              />
            )}
            {!editing && week.notes && (
              <p className="text-xs italic text-muted-foreground">{week.notes}</p>
            )}

            <div className="grid grid-cols-1 gap-2 @min-[860px]:grid-cols-7">
              {DOW_SHORT.map((dow, i) => {
                const dayNo = i + 1
                const date = addDaysStr(plan.startDate, week.weekIndex * 7 + i)
                const sessions = week.sessions.filter(s => s.dayOfWeek === dayNo)
                const isToday = date === today
                return (
                  <div
                    key={dayNo}
                    className={cn(
                      'group rounded-md p-1.5 vspace-1 min-h-[3.5rem]',
                      isToday ? 'ring-2 ring-primary' : 'bg-muted/30',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn('text-[11px] font-medium tabular-nums', isToday ? 'text-primary' : 'text-muted-foreground')}>
                        {dow} {fmtDate(date, 'dd.MM.')}
                      </span>
                      {sessions.length > 0 && (
                        <button
                          type="button"
                          title="Einheit hinzufügen"
                          onClick={() => onCreate(week.weekIndex, dayNo)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {sessions.map(s => (
                      <SessionChip key={s.id} s={s} today={today} onClick={() => onOpenSession(s)} />
                    ))}
                    {sessions.length === 0 && (
                      <button
                        type="button"
                        title="Einheit hinzufügen"
                        onClick={() => onCreate(week.weekIndex, dayNo)}
                        className="flex w-full items-center justify-center rounded-md border border-dashed py-2 text-muted-foreground/60 hover:text-foreground hover:border-foreground/40 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
