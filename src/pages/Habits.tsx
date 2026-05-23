import { useState, useEffect, useCallback, useRef } from 'react'
import { format, subDays } from 'date-fns'
import { Plus, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { HabitRow, HabitLogsMap, HabitColor } from '@/types/ipc'
import { cn } from '@/lib/utils'

// ── Color config ──────────────────────────────────────────────────────────────

const COLOR_CONFIG: Record<HabitColor, {
  fill: string; text: string; border: string; hex: string; softBg: string
}> = {
  blue:   { fill: 'bg-blue-500',    text: 'text-blue-500',    border: 'border-blue-500',    hex: '#3b82f6', softBg: 'bg-blue-500/10'    },
  green:  { fill: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500', hex: '#10b981', softBg: 'bg-emerald-500/10' },
  orange: { fill: 'bg-orange-500',  text: 'text-orange-500',  border: 'border-orange-500',  hex: '#f97316', softBg: 'bg-orange-500/10'  },
  purple: { fill: 'bg-violet-500',  text: 'text-violet-500',  border: 'border-violet-500',  hex: '#8b5cf6', softBg: 'bg-violet-500/10'  },
  rose:   { fill: 'bg-rose-500',    text: 'text-rose-500',    border: 'border-rose-500',    hex: '#f43f5e', softBg: 'bg-rose-500/10'    },
}
const COLORS: HabitColor[] = ['blue', 'green', 'orange', 'purple', 'rose']

function colorOf(c: string) { return COLOR_CONFIG[c as HabitColor] ?? COLOR_CONFIG.blue }
function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

function calcStreak(habitId: number, logs: HabitLogsMap): number {
  let streak = 0
  let d = new Date()
  for (let i = 0; i < 90; i++) {
    const key = format(d, 'yyyy-MM-dd')
    if (!(logs[key] ?? []).includes(habitId)) break
    streak++
    d = subDays(d, 1)
  }
  return streak
}

// ── Completion ring ───────────────────────────────────────────────────────────

function CompletionRing({ done, total }: { done: number; total: number }) {
  const allDone = done === total && total > 0
  const pct     = total > 0 ? done / total : 0
  const r       = 52
  const circ    = 2 * Math.PI * r
  const offset  = circ * (1 - pct)

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: 130, height: 130 }}>
      {/* Rotated wrapper so arc starts at 12 o'clock */}
      <div className="-rotate-90 absolute inset-0">
        <svg width="130" height="130" viewBox="0 0 130 130">
          {/* Track */}
          <circle cx="65" cy="65" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
          {/* Progress arc */}
          {total > 0 && (
            <circle
              cx="65" cy="65" r={r}
              fill="none"
              stroke={allDone ? '#f59e0b' : 'hsl(var(--primary))'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
            />
          )}
        </svg>
      </div>
      {/* Center label (not rotated) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        {allDone ? (
          <span className="text-3xl leading-none select-none">🏆</span>
        ) : (
          <>
            <span className="text-2xl font-bold tabular-nums leading-none">{done}</span>
            <span className="text-xs text-muted-foreground font-medium">/ {total}</span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Streak badge ──────────────────────────────────────────────────────────────

function StreakBadge({ streak }: { streak: number }) {
  if (streak <= 0) return null

  const flames =
    streak >= 30 ? '⚡' :
    streak >= 14 ? '🔥🔥🔥' :
    streak >= 7  ? '🔥🔥' :
    '🔥'

  return (
    <span className={cn(
      'flex items-center gap-0.5 text-xs font-semibold shrink-0 tabular-nums',
      streak >= 30 ? 'text-amber-400' : 'text-orange-500',
    )}>
      {flames} {streak >= 90 ? '90+' : streak}d
    </span>
  )
}

// ── 7-day week strip ──────────────────────────────────────────────────────────

function WeekStrip({ habitId, logs, color }: {
  habitId: number; logs: HabitLogsMap; color: HabitColor
}) {
  const c    = colorOf(color)
  const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i))
  const tStr = todayStr()

  return (
    <div className="flex gap-1.5 items-end">
      {days.map(d => {
        const key     = format(d, 'yyyy-MM-dd')
        const done    = (logs[key] ?? []).includes(habitId)
        const isToday = key === tStr
        const label   = format(d, 'EEEEE')   // single-letter day

        return (
          <div key={key} className="flex flex-col items-center gap-1">
            <div className={cn(
              'rounded-sm transition-all duration-300',
              done ? c.fill : 'bg-muted',
              isToday ? 'w-6 h-6' : 'w-5 h-5',
            )} />
            <span className={cn(
              'text-[9px] font-medium uppercase select-none',
              isToday ? 'text-foreground' : 'text-muted-foreground/50',
            )}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Habit card ────────────────────────────────────────────────────────────────

function HabitCard({
  habit, logs, todayDate, onToggle, onDelete, isToggling,
}: {
  habit: HabitRow
  logs: HabitLogsMap
  todayDate: string
  onToggle: (id: number) => void
  onDelete: (id: number) => void
  isToggling: boolean
}) {
  const [awaitingDelete, setAwaitingDelete] = useState(false)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const c      = colorOf(habit.color)
  const done   = (logs[todayDate] ?? []).includes(habit.id)
  const streak = calcStreak(habit.id, logs)

  // Two-tap delete: first tap arms, second tap confirms; auto-disarms after 3 s
  const handleDeleteClick = () => {
    if (!awaitingDelete) {
      setAwaitingDelete(true)
      deleteTimerRef.current = setTimeout(() => setAwaitingDelete(false), 3000)
    } else {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      setAwaitingDelete(false)
      onDelete(habit.id)
    }
  }

  useEffect(() => () => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
  }, [])

  return (
    <div className={cn(
      'relative rounded-xl border bg-card overflow-hidden transition-all duration-300',
      done && 'border-border/40 opacity-90',
    )}>
      {/* Left color accent bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', c.fill)} />

      <div className="pl-5 pr-3 py-4">
        <div className="flex items-center gap-3">

          {/* Large circular toggle */}
          <button
            type="button"
            onClick={() => onToggle(habit.id)}
            disabled={isToggling}
            aria-label={done ? 'Mark incomplete' : 'Mark complete'}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 text-xl',
              done
                ? cn(c.fill, 'shadow-lg scale-110')
                : cn(c.softBg, 'border-2', c.border, 'hover:scale-105'),
              isToggling && 'opacity-40 cursor-not-allowed !scale-100',
            )}
          >
            <span className={cn('leading-none select-none', !done && 'opacity-60')}>
              {habit.emoji || '⚡'}
            </span>
          </button>

          {/* Name + streak + week strip */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={cn(
                'font-semibold text-base leading-tight truncate',
                done && 'line-through text-muted-foreground',
              )}>
                {habit.name}
              </span>
              <StreakBadge streak={streak} />
            </div>
            <WeekStrip habitId={habit.id} logs={logs} color={habit.color} />
          </div>

          {/* Two-tap delete */}
          <button
            type="button"
            onClick={handleDeleteClick}
            className={cn(
              'shrink-0 self-start rounded-lg px-2 py-1 text-xs font-medium transition-all',
              awaitingDelete
                ? 'bg-destructive/10 text-destructive'
                : 'text-muted-foreground/30 hover:text-destructive',
            )}
            title={awaitingDelete ? 'Click again to confirm' : 'Delete habit'}
          >
            {awaitingDelete ? 'Delete?' : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add habit form ────────────────────────────────────────────────────────────

function AddHabitForm({ onSaved }: { onSaved: () => void }) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [emoji,  setEmoji]  = useState('⚡')
  const [color,  setColor]  = useState<HabitColor>('blue')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const reset = () => { setOpen(false); setName(''); setEmoji('⚡'); setColor('blue'); setError(null) }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true); setError(null)
    try {
      await invoke(IPC.HABITS_CREATE, { name: trimmed, emoji: emoji || '⚡', color })
      reset(); onSaved()
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors w-full"
      >
        <Plus className="h-4 w-4" /> New habit
      </button>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Input
          value={emoji}
          onChange={e => setEmoji(e.target.value)}
          className="w-14 text-center text-xl h-10"
          placeholder="⚡"
        />
        <Input
          autoFocus
          placeholder="e.g. Cold shower, Read 20 min"
          value={name}
          onChange={e => { setName(e.target.value); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && save()}
          className="flex-1"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Color:</span>
        {COLORS.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={cn(
              'w-6 h-6 rounded-full transition-all',
              COLOR_CONFIG[c].fill,
              color === c
                ? 'ring-2 ring-offset-2 ring-offset-card opacity-100 scale-110'
                : 'opacity-50 hover:opacity-80',
            )}
          />
        ))}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Add'}
        </Button>
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Habits() {
  const [habits,      setHabits]      = useState<HabitRow[]>([])
  const [logs,        setLogs]        = useState<HabitLogsMap>({})
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState<string | null>(null)

  const togglingRef   = useRef<Set<number>>(new Set())
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<number>>(new Set())

  const today = todayStr()

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const [h, l] = await Promise.all([
        invoke<HabitRow[]>(IPC.HABITS_LIST),
        invoke<HabitLogsMap>(IPC.HABIT_LOGS_GET, {
          dateFrom: format(subDays(new Date(), 89), 'yyyy-MM-dd'),
          dateTo:   todayStr(),
        }),
      ])
      setHabits(h); setLogs(l); setLoadError(null)
    } catch {
      setLoadError('Could not load habits. Please restart the app.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Toggle ──────────────────────────────────────────────────────────────────

  const handleToggle = async (id: number) => {
    if (togglingRef.current.has(id)) return
    togglingRef.current.add(id)
    setTogglingIds(new Set(togglingRef.current))

    const snapshot    = logs[today] ?? []
    const alreadyDone = snapshot.includes(id)

    setLogs(prev => ({
      ...prev,
      [today]: alreadyDone
        ? (prev[today] ?? []).filter(x => x !== id)
        : [...(prev[today] ?? []), id],
    }))

    try {
      await invoke(IPC.HABIT_LOG_TOGGLE, { habitId: id, date: today })
    } catch {
      setLogs(prev => ({ ...prev, [today]: snapshot }))
    } finally {
      togglingRef.current.delete(id)
      setTogglingIds(new Set(togglingRef.current))
    }
  }

  // ── Delete (optimistic, with rollback) ──────────────────────────────────────

  const handleDelete = async (id: number) => {
    const backup = habits
    setHabits(prev => prev.filter(h => h.id !== id))
    try {
      await invoke(IPC.HABITS_DELETE, id)
    } catch {
      setHabits(backup)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const doneToday = (logs[today] ?? []).length
  const total     = habits.length
  const allDone   = doneToday === total && total > 0

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2.5 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading habits…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Habits</h1>
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8 max-w-2xl">

      {/* ── Header + Ring ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-8">
        {total > 0 && <CompletionRing done={doneToday} total={total} />}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Habits</h1>
          {total === 0 ? (
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Build the daily systems that make you elite.
            </p>
          ) : allDone ? (
            <div className="mt-2 space-y-1">
              <p className="text-xl font-bold text-amber-500">Perfect day!</p>
              <p className="text-sm text-muted-foreground">
                All {total} habit{total !== 1 ? 's' : ''} crushed. Keep the streak alive.
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-1">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{doneToday} of {total}</span> done today
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {habits
                  .filter(h => !(logs[today] ?? []).includes(h.id))
                  .slice(0, 2)
                  .map(h => `${h.emoji} ${h.name}`)
                  .join(' · ')}
                {total - doneToday > 2 ? ` +${total - doneToday - 2} more` : ''}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Perfect day banner ────────────────────────────────────────── */}
      {allDone && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-5 py-4 text-center">
          <p className="text-amber-600 dark:text-amber-400 font-semibold">
            🏆 All habits complete! Your streak is growing. Keep it up tomorrow.
          </p>
        </div>
      )}

      {/* ── Habit cards ───────────────────────────────────────────────── */}
      {habits.length > 0 && (
        <div className="space-y-3">
          {habits.map(h => (
            <HabitCard
              key={h.id}
              habit={h}
              logs={logs}
              todayDate={today}
              onToggle={handleToggle}
              onDelete={handleDelete}
              isToggling={togglingIds.has(h.id)}
            />
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {habits.length === 0 && (
        <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
          <p className="text-4xl select-none">⚡</p>
          <p className="font-semibold">No habits yet</p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Discipline is built one daily rep at a time. Add your first habit below.
          </p>
        </div>
      )}

      {/* ── Add form ──────────────────────────────────────────────────── */}
      <AddHabitForm onSaved={load} />
    </div>
  )
}
