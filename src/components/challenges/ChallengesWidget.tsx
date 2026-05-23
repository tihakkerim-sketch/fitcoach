import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, CheckCircle2, Circle, ChevronRight, Trophy } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { DailyChallenge, TodayChallengesResult } from '@/types/ipc'
import { cn } from '@/lib/utils'

// ── Widget ────────────────────────────────────────────────────────────────────

export function ChallengesWidget() {
  const navigate = useNavigate()
  const [challenges, setChallenges] = useState<DailyChallenge[]>([])
  const [streak,     setStreak]     = useState(0)
  const [loaded,     setLoaded]     = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await invoke<TodayChallengesResult>(IPC.CHALLENGES_TODAY_GET)
      setChallenges(res.challenges)
      setStreak(res.streak)
    } catch { /* silent */ } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleToggle(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    try {
      const updated = await invoke<DailyChallenge>(IPC.CHALLENGE_TOGGLE, id)
      setChallenges(prev => prev.map(c => c.id === id ? updated : c))
      // Refresh streak after toggle
      const res = await invoke<TodayChallengesResult>(IPC.CHALLENGES_TODAY_GET)
      setStreak(res.streak)
    } catch { /* silent */ }
  }

  if (!loaded || challenges.length === 0) return null

  const doneCount = challenges.filter(c => c.completed).length
  const allDone   = doneCount === challenges.length

  return (
    <button
      onClick={() => navigate('/challenges')}
      className="group w-full rounded-xl border bg-card p-4 text-left hover:shadow-md hover:scale-[1.005] transition-all"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Challenges
          </p>
          {streak > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-500">
              <Flame className="h-3 w-3" />
              {streak}d
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {allDone
            ? <Trophy className="h-4 w-4 text-emerald-500" />
            : (
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {doneCount}/{challenges.length}
              </span>
            )
          }
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            allDone ? 'bg-emerald-500' : 'bg-primary'
          )}
          style={{ width: `${(doneCount / challenges.length) * 100}%` }}
        />
      </div>

      {/* Challenge rows */}
      <div className="space-y-2">
        {challenges.map(c => (
          <div key={c.id} className="flex items-center gap-2.5">
            {/* Toggle button — stops propagation so clicking it doesn't navigate */}
            <button
              onClick={e => handleToggle(e, c.id)}
              className={cn(
                'shrink-0 transition-all duration-150 hover:scale-110 active:scale-95',
                c.completed
                  ? 'text-emerald-500'
                  : 'text-muted-foreground/40 hover:text-primary'
              )}
            >
              {c.completed
                ? <CheckCircle2 className="h-4 w-4" />
                : <Circle       className="h-4 w-4" />
              }
            </button>
            <p className={cn(
              'text-xs font-medium flex-1 min-w-0 truncate',
              c.completed && 'line-through text-muted-foreground'
            )}>
              {c.text}
            </p>
          </div>
        ))}
      </div>
    </button>
  )
}
