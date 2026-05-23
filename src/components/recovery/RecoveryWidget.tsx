import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Zap, Moon, Activity, Heart, ChevronRight } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { RecoveryLog } from '@/types/ipc'
import { cn } from '@/lib/utils'

function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

function scoreColor(v: number | undefined) {
  if (v == null) return 'text-muted-foreground'
  if (v >= 70)   return 'text-green-500'
  if (v >= 40)   return 'text-amber-500'
  return 'text-red-500'
}

function scoreBadgeBg(v: number | undefined) {
  if (v == null) return 'bg-muted/50'
  if (v >= 70)   return 'bg-green-500/10'
  if (v >= 40)   return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

// ── Compact metric pill ───────────────────────────────────────────────────────

function MetricPill({
  icon: Icon, label, value, unit = '',
}: {
  icon: React.ElementType
  label: string
  value?: number
  unit?: string
}) {
  return (
    <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2 flex-1', scoreBadgeBg(value))}>
      <Icon className={cn('h-3.5 w-3.5 shrink-0', scoreColor(value))} />
      <div className="min-w-0">
        <p className={cn('text-sm font-bold tabular-nums leading-none', scoreColor(value))}>
          {value != null ? Math.round(value) : '—'}
          {unit && <span className="text-[10px] font-normal ml-0.5">{unit}</span>}
        </p>
        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5 truncate">
          {label}
        </p>
      </div>
    </div>
  )
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function RecoveryWidget() {
  const navigate = useNavigate()
  const [log,    setLog]    = useState<RecoveryLog | null>(null)
  const [loaded, setLoaded] = useState(false)

  const today = todayStr()

  const load = useCallback(async () => {
    try {
      const logs = await invoke<RecoveryLog[]>(IPC.RECOVERY_LOGS_GET, {
        dateFrom: today,
        dateTo:   today,
      })
      setLog(logs[0] ?? null)
    } catch { /* silent */ } finally {
      setLoaded(true)
    }
  }, [today])

  useEffect(() => { load() }, [load])

  if (!loaded) return null

  // Decide which metrics to show
  const hasBodyBattery = log?.bodyBattery    != null
  const hasSleepScore  = log?.sleepScore     != null
  const hasReadiness   = log?.readinessScore != null
  const hasHrv         = log?.hrvRmssd       != null

  const hasAny = hasBodyBattery || hasSleepScore || hasReadiness || hasHrv

  // Compute an overall recovery "mood" label from the scores that exist
  const scores = [log?.bodyBattery, log?.sleepScore, log?.readinessScore].filter((v): v is number => v != null)
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  const moodLabel =
    avgScore == null ? null :
    avgScore >= 70   ? 'Good recovery 🟢' :
    avgScore >= 40   ? 'Moderate recovery 🟡' :
    'Poor recovery 🔴'

  return (
    <button
      onClick={() => navigate('/recovery')}
      className="group w-full rounded-xl border bg-card p-4 text-left hover:shadow-md hover:scale-[1.005] transition-all"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recovery</p>
          {moodLabel && (
            <p className="text-xs font-semibold mt-0.5">{moodLabel}</p>
          )}
          {!hasAny && (
            <p className="text-xs text-muted-foreground mt-0.5">No data logged today — tap to add</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </div>

      {/* Metric pills */}
      {hasAny && (
        <div className="flex gap-2">
          {hasBodyBattery && (
            <MetricPill icon={Zap}      label="Body Bat." value={log?.bodyBattery}    />
          )}
          {hasSleepScore && (
            <MetricPill icon={Moon}     label="Sleep"      value={log?.sleepScore}     />
          )}
          {hasReadiness && (
            <MetricPill icon={Activity} label="Readiness"  value={log?.readinessScore} />
          )}
          {hasHrv && (
            <MetricPill icon={Heart}    label="HRV"        value={log?.hrvRmssd} unit="ms" />
          )}
        </div>
      )}
    </button>
  )
}
