import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, Trash2, TrendingUp, Zap, Moon, Dumbbell, Activity } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { ActivityRow } from '@/types/ipc'
import { useToast } from '@/contexts/ToastContext'
import { cn } from '@/lib/utils'

interface Props {
  activity: ActivityRow
  onDeleted: () => void
}

// ── Type config ───────────────────────────────────────────────────────────────

interface TypeConfig {
  Icon: LucideIcon
  iconBg: string
  iconText: string
  badge: string
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  running:  { Icon: TrendingUp, iconBg: 'bg-blue-500/10',    iconText: 'text-blue-500',    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'    },
  cycling:  { Icon: Zap,        iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-500', badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  sleep:    { Icon: Moon,       iconBg: 'bg-violet-500/10',  iconText: 'text-violet-500',  badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20'  },
  strength: { Icon: Dumbbell,   iconBg: 'bg-orange-500/10',  iconText: 'text-orange-500',  badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'  },
  custom:   { Icon: Activity,   iconBg: 'bg-slate-500/10',   iconText: 'text-slate-500',   badge: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'    },
}

function getConfig(type: string): TypeConfig {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.custom
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(min?: number) {
  if (!min) return null
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  )
}

function calcPace(durationMin?: number, distanceKm?: number | null): string | null {
  const km  = Number(distanceKm) || 0
  const min = durationMin ?? 0
  if (km < 0.01 || min === 0) return null
  const secPerKm = (min * 60) / km
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')} /km`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActivityCard({ activity, onDeleted }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { toast } = useToast()

  // Clean up timer if component unmounts while delete is pending
  useEffect(() => () => {
    if (deleteTimer.current) clearTimeout(deleteTimer.current)
  }, [])

  const label = activity.type === 'custom' && activity.typeLabel
    ? activity.typeLabel
    : activity.type.charAt(0).toUpperCase() + activity.type.slice(1)

  const cfg = getConfig(activity.type)
  const { Icon } = cfg

  const handleDelete = () => {
    setPendingDelete(true)

    const undo = () => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current)
      deleteTimer.current = null
      setPendingDelete(false)
    }

    toast({
      message: `${label} activity deleted`,
      undoLabel: 'Undo',
      onUndo: undo,
      duration: 5000,
    })

    deleteTimer.current = setTimeout(async () => {
      try {
        await invoke(IPC.ACTIVITIES_DELETE, activity.id)
        onDeleted()
      } catch {
        setPendingDelete(false)
      }
    }, 5000)
  }

  return (
    <div className={cn('rounded-xl border bg-card transition-all', pendingDelete ? 'opacity-50 scale-[0.99]' : 'hover:shadow-sm')}>

      {/* ── Header row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 p-4">

        {/* Type icon */}
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', cfg.iconBg)}>
          <Icon className={cn('h-5 w-5', cfg.iconText)} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Type badge */}
            <span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full border', cfg.badge)}>
              {label}
            </span>
            {activity.source === 'garmin_import' && (
              <Badge variant="outline" className="text-xs">Garmin</Badge>
            )}
            <span className="text-sm font-medium">
              {format(new Date(activity.date), 'EEE, MMM d, yyyy')}
            </span>
            {activity.startTime && (
              <span className="text-xs text-muted-foreground">{activity.startTime}</span>
            )}
          </div>

          {/* Quick stats row */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {formatDuration(activity.durationMin) && (
              <MetaPill>{formatDuration(activity.durationMin)}</MetaPill>
            )}
            {activity.distanceKm != null && (
              <MetaPill>{Number(activity.distanceKm).toFixed(2)} km</MetaPill>
            )}
            {activity.type === 'running' && (() => {
              const pace = calcPace(activity.durationMin, activity.distanceKm)
              return pace ? <MetaPill>{pace}</MetaPill> : null
            })()}
            {activity.avgHr && (
              <MetaPill>♥ {activity.avgHr} bpm</MetaPill>
            )}
            {activity.sleepQuality && (
              <MetaPill>Quality {activity.sleepQuality}/100</MetaPill>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={pendingDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Expanded detail ─────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {activity.maxHr && (
              <div>
                <p className="text-xs text-muted-foreground">Max HR</p>
                <p className="font-medium">{activity.maxHr} bpm</p>
              </div>
            )}
            {activity.perceivedEffort && (
              <div>
                <p className="text-xs text-muted-foreground">Effort</p>
                <p className="font-medium">{activity.perceivedEffort}/10</p>
              </div>
            )}
            {activity.surfaceType && (
              <div>
                <p className="text-xs text-muted-foreground">Surface</p>
                <p className="font-medium capitalize">{activity.surfaceType}</p>
              </div>
            )}
            {activity.avgCadence && (
              <div>
                <p className="text-xs text-muted-foreground">Cadence</p>
                <p className="font-medium">{activity.avgCadence} rpm</p>
              </div>
            )}
            {activity.bedtime && activity.wakeTime && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Sleep window</p>
                <p className="font-medium">{activity.bedtime} → {activity.wakeTime}</p>
              </div>
            )}
          </div>

          {activity.exercises && (activity.exercises as unknown as string).length > 0 && (() => {
            try {
              const exs: Array<{ name: string; sets: number; reps: number }> =
                typeof activity.exercises === 'string'
                  ? JSON.parse(activity.exercises as unknown as string)
                  : activity.exercises as unknown as Array<{ name: string; sets: number; reps: number }>
              if (!exs.length) return null
              return (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Exercises</p>
                  <div className="flex flex-wrap gap-2">
                    {exs.map((ex, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs">
                        <span className="font-medium">{ex.name}</span>
                        <span className="text-muted-foreground">{ex.sets}×{ex.reps}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )
            } catch { return null }
          })()}

          {activity.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-muted-foreground">{activity.notes}</p>
            </div>
          )}

          {activity.garminFileName && (
            <p className="text-xs text-muted-foreground/60">Source: {activity.garminFileName}</p>
          )}
        </div>
      )}
    </div>
  )
}
