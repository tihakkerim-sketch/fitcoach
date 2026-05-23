import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { HabitRow, HabitLogsMap, HabitColor } from '@/types/ipc'
import { cn } from '@/lib/utils'

// ── Color maps ────────────────────────────────────────────────────────────────

const COLOR_FILL: Record<HabitColor, string> = {
  blue:   'bg-blue-500',
  green:  'bg-emerald-500',
  orange: 'bg-orange-500',
  purple: 'bg-violet-500',
  rose:   'bg-rose-500',
}

const COLOR_SOFT: Record<HabitColor, string> = {
  blue:   'bg-blue-500/10',
  green:  'bg-emerald-500/10',
  orange: 'bg-orange-500/10',
  purple: 'bg-violet-500/10',
  rose:   'bg-rose-500/10',
}

function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

// ── Mini completion ring (r=18, viewBox 44×44) ────────────────────────────────

function MiniRing({ done, total }: { done: number; total: number }) {
  const allDone = done === total && total > 0
  const pct     = total > 0 ? done / total : 0
  const r       = 18
  const circ    = 2 * Math.PI * r
  const offset  = circ * (1 - pct)

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: 44, height: 44 }}>
      <div className="-rotate-90 absolute inset-0">
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
          {total > 0 && (
            <circle
              cx="22" cy="22" r={r}
              fill="none"
              stroke={allDone ? '#f59e0b' : 'hsl(var(--primary))'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
          )}
        </svg>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        {allDone ? (
          <span className="text-sm leading-none select-none">🏆</span>
        ) : (
          <span className="text-[10px] font-bold tabular-nums leading-none">{done}/{total}</span>
        )}
      </div>
    </div>
  )
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function HabitsWidget() {
  const navigate = useNavigate()
  const [habits,      setHabits]      = useState<HabitRow[]>([])
  const [logs,        setLogs]        = useState<HabitLogsMap>({})
  const [loaded,      setLoaded]      = useState(false)

  const togglingRef   = useRef<Set<number>>(new Set())
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<number>>(new Set())

  const today = todayStr()

  const load = useCallback(async () => {
    const [h, l] = await Promise.all([
      invoke<HabitRow[]>(IPC.HABITS_LIST).catch(() => []),
      invoke<HabitLogsMap>(IPC.HABIT_LOGS_GET, { dateFrom: today, dateTo: today }).catch(() => ({})),
    ])
    setHabits(h)
    setLogs(l)
    setLoaded(true)
  }, [today])

  useEffect(() => { load() }, [load])

  // ── Toggle with optimistic UI + rollback ────────────────────────────────────

  const handleToggle = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
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

  // Don't render until loaded; hide if no habits exist
  if (!loaded || habits.length === 0) return null

  const done    = (logs[today] ?? []).length
  const total   = habits.length
  const allDone = done === total && total > 0
  const pct     = Math.round((done / total) * 100)

  return (
    <div className="rounded-xl border bg-card overflow-hidden">

      {/* ── Header: ring + progress ─────────────────────────────────── */}
      <button
        onClick={() => navigate('/habits')}
        className="group w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <MiniRing done={done} total={total} />

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">
            {allDone ? '🏆 All habits done!' : `${done} / ${total} habits done`}
          </p>
          {allDone ? (
            <p className="text-xs text-amber-500 font-medium mt-0.5">
              Perfect day — keep the streak! 🔥
            </p>
          ) : (
            <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* ── Emoji toggle buttons ────────────────────────────────────── */}
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        {habits.map(h => {
          const isDone     = (logs[today] ?? []).includes(h.id)
          const isToggling = togglingIds.has(h.id)
          const color      = (h.color as HabitColor) ?? 'blue'

          return (
            <button
              key={h.id}
              type="button"
              onClick={e => handleToggle(e, h.id)}
              disabled={isToggling}
              title={h.name}
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all duration-200 select-none',
                isDone
                  ? cn(COLOR_FILL[color] ?? COLOR_FILL.blue, 'shadow-md scale-105')
                  : cn(COLOR_SOFT[color] ?? COLOR_SOFT.blue, 'opacity-60 hover:opacity-90 hover:scale-105'),
                isToggling && 'opacity-40 cursor-not-allowed !scale-100',
              )}
            >
              {h.emoji || '⚡'}
            </button>
          )
        })}
      </div>
    </div>
  )
}
