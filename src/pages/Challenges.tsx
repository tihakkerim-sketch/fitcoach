import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import {
  Flame, CheckCircle2, Circle, Plus, Trash2, ToggleLeft, ToggleRight, Trophy,
  Dumbbell, Brain, Apple, Wind, Sparkles,
} from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type {
  DailyChallenge, ChallengePoolEntry, TodayChallengesResult,
  AddChallengePayload, ChallengeCategory,
} from '@/types/ipc'
import { cn } from '@/lib/utils'

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<ChallengeCategory, {
  label: string
  Icon: React.ElementType
  color: string
  bg: string
  border: string
}> = {
  fitness:   { label: 'Fitness',   Icon: Dumbbell, color: 'text-blue-500',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30'   },
  mobility:  { label: 'Mobility',  Icon: Wind,     color: 'text-cyan-500',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30'   },
  mindset:   { label: 'Mindset',   Icon: Brain,    color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  nutrition: { label: 'Nutrition', Icon: Apple,    color: 'text-emerald-500',bg: 'bg-emerald-500/10',border: 'border-emerald-500/30'},
  custom:    { label: 'Custom',    Icon: Sparkles, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
}

// ── Tiny category chip ────────────────────────────────────────────────────────

function CategoryChip({ category }: { category: ChallengeCategory }) {
  const { label, Icon, color, bg } = CATEGORY_CONFIG[category]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', bg, color)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  )
}

// ── Today challenge card ──────────────────────────────────────────────────────

function ChallengeCard({
  challenge,
  onToggle,
}: {
  challenge: DailyChallenge
  onToggle: (id: number) => void
}) {
  const [busy, setBusy] = useState(false)

  async function handleToggle() {
    if (busy) return
    setBusy(true)
    onToggle(challenge.id)
    setBusy(false)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-xl border p-4 transition-all duration-200',
        challenge.completed
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-border bg-card hover:border-border/80'
      )}
    >
      <button
        onClick={handleToggle}
        disabled={busy}
        className={cn(
          'shrink-0 transition-all duration-200 hover:scale-110 active:scale-95',
          challenge.completed ? 'text-emerald-500' : 'text-muted-foreground/40 hover:text-primary'
        )}
      >
        {challenge.completed
          ? <CheckCircle2 className="h-7 w-7" />
          : <Circle       className="h-7 w-7" />
        }
      </button>

      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-semibold leading-snug',
          challenge.completed && 'line-through text-muted-foreground'
        )}>
          {challenge.text}
        </p>
        {challenge.completedAt && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Done at {format(new Date(challenge.completedAt), 'HH:mm')}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Pool entry row ────────────────────────────────────────────────────────────

function PoolRow({
  entry,
  onToggleActive,
  onDelete,
}: {
  entry: ChallengePoolEntry
  onToggleActive: (id: number) => void
  onDelete: (id: number) => void
}) {
  const [deleteArmed, setDeleteArmed] = useState(false)
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleDeleteClick() {
    if (deleteArmed) {
      onDelete(entry.id)
    } else {
      setDeleteArmed(true)
      armTimerRef.current = setTimeout(() => setDeleteArmed(false), 3000)
    }
  }

  useEffect(() => () => { if (armTimerRef.current) clearTimeout(armTimerRef.current) }, [])

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
      entry.isActive ? 'border-border bg-card' : 'border-border/40 bg-muted/20 opacity-60'
    )}>
      <CategoryChip category={entry.category} />

      <p className={cn(
        'flex-1 text-sm min-w-0 truncate',
        !entry.isActive && 'text-muted-foreground'
      )}>
        {entry.text}
      </p>

      {/* Toggle active */}
      <button
        onClick={() => onToggleActive(entry.id)}
        title={entry.isActive ? 'Deactivate' : 'Activate'}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        {entry.isActive
          ? <ToggleRight className="h-4 w-4 text-emerald-500" />
          : <ToggleLeft  className="h-4 w-4" />
        }
      </button>

      {/* Delete (custom only) */}
      {!entry.isBuiltIn && (
        <button
          onClick={handleDeleteClick}
          title={deleteArmed ? 'Click again to confirm' : 'Delete'}
          className={cn(
            'transition-colors shrink-0 text-xs font-medium',
            deleteArmed
              ? 'text-red-500 hover:text-red-600'
              : 'text-muted-foreground/40 hover:text-red-400'
          )}
        >
          {deleteArmed ? 'Confirm' : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  )
}

// ── Add custom challenge form ──────────────────────────────────────────────────

const CATEGORY_OPTIONS: ChallengeCategory[] = ['fitness', 'mobility', 'mindset', 'nutrition', 'custom']

function AddChallengeForm({ onAdd }: { onAdd: (payload: AddChallengePayload) => void }) {
  const [text,     setText]     = useState('')
  const [category, setCategory] = useState<ChallengeCategory>('fitness')
  const [open,     setOpen]     = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    onAdd({ text: trimmed, category })
    setText('')
    setCategory('fitness')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-2.5 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors w-full"
      >
        <Plus className="h-4 w-4" />
        Add custom challenge
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-semibold">New Challenge</p>

      <input
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="e.g. Do 15 dips"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      />

      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_OPTIONS.map(cat => {
          const { label, color, bg } = CATEGORY_CONFIG[cat]
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold border transition-colors',
                category === cat
                  ? cn(bg, color, 'border-transparent')
                  : 'border-border text-muted-foreground hover:border-border/80'
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'today' | 'pool'

export default function Challenges() {
  const [tab,        setTab]        = useState<Tab>('today')
  const [challenges, setChallenges] = useState<DailyChallenge[]>([])
  const [streak,     setStreak]     = useState(0)
  const [pool,       setPool]       = useState<ChallengePoolEntry[]>([])
  const [loaded,     setLoaded]     = useState(false)

  const loadToday = useCallback(async () => {
    try {
      const res = await invoke<TodayChallengesResult>(IPC.CHALLENGES_TODAY_GET)
      setChallenges(res.challenges)
      setStreak(res.streak)
    } catch { /* silent */ }
  }, [])

  const loadPool = useCallback(async () => {
    try {
      const res = await invoke<ChallengePoolEntry[]>(IPC.CHALLENGE_POOL_LIST)
      setPool(res)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    Promise.all([loadToday(), loadPool()]).finally(() => setLoaded(true))
  }, [loadToday, loadPool])

  async function handleToggle(id: number) {
    try {
      const updated = await invoke<DailyChallenge>(IPC.CHALLENGE_TOGGLE, id)
      setChallenges(prev => prev.map(c => c.id === id ? updated : c))
      // Refresh streak
      const res = await invoke<TodayChallengesResult>(IPC.CHALLENGES_TODAY_GET)
      setStreak(res.streak)
    } catch { /* silent */ }
  }

  async function handleToggleActive(id: number) {
    try {
      const updated = await invoke<ChallengePoolEntry>(IPC.CHALLENGE_POOL_TOGGLE_ACTIVE, id)
      setPool(prev => prev.map(e => e.id === id ? updated : e))
    } catch { /* silent */ }
  }

  async function handleDelete(id: number) {
    try {
      await invoke<void>(IPC.CHALLENGE_POOL_DELETE, id)
      setPool(prev => prev.filter(e => e.id !== id))
    } catch { /* silent */ }
  }

  async function handleAdd(payload: AddChallengePayload) {
    try {
      const entry = await invoke<ChallengePoolEntry>(IPC.CHALLENGE_POOL_ADD, payload)
      setPool(prev => [...prev, entry])
    } catch { /* silent */ }
  }

  if (!loaded) return null

  const allDone = challenges.length > 0 && challenges.every(c => c.completed)
  const doneCount = challenges.filter(c => c.completed).length

  return (
    <div className="p-8 max-w-2xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Challenges</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), 'EEEE, MMMM d')} · 3 challenges per day
          </p>
        </div>

        {/* Streak badge */}
        {streak > 0 && (
          <div className="flex items-center gap-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 px-4 py-2">
            <Flame className="h-5 w-5 text-orange-500" />
            <div className="text-right">
              <p className="text-lg font-bold text-orange-500 leading-none">{streak}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500/70 leading-none mt-0.5">
                day streak
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1 w-fit">
        {(['today', 'pool'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-lg px-5 py-1.5 text-sm font-medium transition-all',
              tab === t
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'today' ? "Today's Challenges" : 'Challenge Pool'}
          </button>
        ))}
      </div>

      {/* ── Today tab ── */}
      {tab === 'today' && (
        <div className="space-y-3">
          {/* Progress bar */}
          {challenges.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${(doneCount / challenges.length) * 100}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {doneCount}/{challenges.length}
              </span>
            </div>
          )}

          {/* All done banner */}
          {allDone && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3">
              <Trophy className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  All done! Great work today 🎉
                </p>
                <p className="text-xs text-muted-foreground">
                  Come back tomorrow for new challenges
                </p>
              </div>
            </div>
          )}

          {/* Challenge cards */}
          {challenges.map(c => (
            <ChallengeCard key={c.id} challenge={c} onToggle={handleToggle} />
          ))}

          {challenges.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
              <p className="text-sm text-muted-foreground">No challenges generated yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Make sure the Challenge Pool has active entries.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Pool tab ── */}
      {tab === 'pool' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Toggle challenges on/off to control which ones can appear in your daily picks.
            Add custom challenges alongside the built-ins.
          </p>

          <AddChallengeForm onAdd={handleAdd} />

          <div className="space-y-1.5">
            {pool.map(entry => (
              <PoolRow
                key={entry.id}
                entry={entry}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
