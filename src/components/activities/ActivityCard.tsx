import { useState } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronDown, ChevronUp, Trash2, Pencil, TrendingUp, Zap, Moon, Dumbbell, Activity } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { ActivityRow } from '@/types/ipc'
import { useToast } from '@/contexts/ToastContext'
import { cn } from '@/lib/utils'
import { ActivityDetails } from '@/components/activities/ActivityDetails'
import { LogActivityModal } from '@/components/activities/LogActivityModal'
import { emitDataChanged } from '@/lib/dataEvents'

interface Props {
  activity: ActivityRow
  /** Nach Löschen, Wiederherstellen oder Bearbeiten: Liste neu laden. */
  onChanged: () => void
  shoeName?: string
}

const TYPE_LABELS: Record<string, string> = {
  running: 'Laufen', cycling: 'Radfahren', sleep: 'Schlaf', strength: 'Kraft', custom: 'Sonstiges',
}

const SURFACE_LABELS: Record<string, string> = {
  road: 'Straße', trail: 'Gelände', track: 'Bahn', treadmill: 'Laufband', other: 'Sonstiges',
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
  return h > 0 ? `${h} Std. ${m} min` : `${m} min`
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
  return `${m}:${s.toString().padStart(2, '0')} min/km`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActivityCard({ activity, onChanged, shoeName }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()

  const label = activity.type === 'custom' && activity.typeLabel
    ? activity.typeLabel
    : TYPE_LABELS[activity.type] ?? activity.type

  const cfg = getConfig(activity.type)
  const { Icon } = cfg

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await invoke(IPC.ACTIVITIES_DELETE, activity.id)
    } catch {
      setDeleting(false)
      toast({ message: 'Löschen fehlgeschlagen.', duration: 5000 })
      return
    }
    emitDataChanged()
    onChanged()
    toast({
      message: 'Aktivität gelöscht',
      undoLabel: 'Rückgängig',
      duration: 8000,
      onUndo: () => {
        invoke(IPC.ACTIVITIES_RESTORE, activity.id)
          .then(() => { emitDataChanged(); onChanged() })
          .catch(() => toast({ message: 'Wiederherstellen fehlgeschlagen.', duration: 5000 }))
      },
    })
  }

  return (
    <div className={cn('rounded-xl border bg-card transition-all', deleting ? 'opacity-50 scale-[0.99]' : 'hover:shadow-xs')}>

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
              <Badge variant="outline" className="text-xs" title="Aus einer Garmin-Datei importiert">Datei-Import</Badge>
            )}
            {activity.source === 'intervals_icu' && (
              <Badge variant="outline" className="text-xs">intervals.icu</Badge>
            )}
            <span className="text-sm font-medium">
              {format(new Date(`${activity.date}T12:00:00`), 'EEE, d. MMM yyyy', { locale: de })}
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
              <MetaPill>{Number(activity.distanceKm).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km</MetaPill>
            )}
            {activity.type === 'running' && (() => {
              const pace = calcPace(activity.durationMin, activity.distanceKm)
              return pace ? <MetaPill>{pace}</MetaPill> : null
            })()}
            {activity.avgHr && (
              <MetaPill>♥ {activity.avgHr} bpm</MetaPill>
            )}
            {activity.sleepQuality && (
              <MetaPill>Qualität {activity.sleepQuality}/100</MetaPill>
            )}
            {activity.type === 'running' && shoeName && (
              <span className="text-xs text-muted-foreground">Schuh: {shoeName}</span>
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
            title={expanded ? 'Details ausblenden' : 'Details anzeigen'}
            aria-label={expanded ? 'Details ausblenden' : 'Details anzeigen'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={() => setEditOpen(true)}
            title="Bearbeiten"
            aria-label="Bearbeiten"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => void handleDelete()}
            disabled={deleting}
            title="Löschen"
            aria-label="Löschen"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Expanded detail ─────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 vspace-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {activity.maxHr && (
              <div>
                <p className="text-xs text-muted-foreground">Max. Puls</p>
                <p className="font-medium">{activity.maxHr} bpm</p>
              </div>
            )}
            {activity.perceivedEffort && (
              <div>
                <p className="text-xs text-muted-foreground">Anstrengung</p>
                <p className="font-medium">{activity.perceivedEffort}/10</p>
              </div>
            )}
            {activity.surfaceType && (
              <div>
                <p className="text-xs text-muted-foreground">Untergrund</p>
                <p className="font-medium">{SURFACE_LABELS[activity.surfaceType] ?? activity.surfaceType}</p>
              </div>
            )}
            {(activity.elevationGainM != null || activity.elevationLossM != null) && (
              <div>
                <p className="text-xs text-muted-foreground">Höhenmeter</p>
                <p className="font-medium">
                  {activity.elevationGainM != null && `↑ ${Math.round(activity.elevationGainM)} m`}
                  {activity.elevationGainM != null && activity.elevationLossM != null && '  '}
                  {activity.elevationLossM != null && `↓ ${Math.round(activity.elevationLossM)} m`}
                </p>
              </div>
            )}
            {activity.movingTimeMin != null && (
              <div>
                <p className="text-xs text-muted-foreground">Bewegungszeit</p>
                <p className="font-medium">{formatDuration(activity.movingTimeMin)}</p>
              </div>
            )}
            {activity.avgCadence && (
              <div>
                <p className="text-xs text-muted-foreground">Kadenz</p>
                <p className="font-medium">{activity.avgCadence} U/min</p>
              </div>
            )}
            {activity.bedtime && activity.wakeTime && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Schlafzeit</p>
                <p className="font-medium">{activity.bedtime} → {activity.wakeTime}</p>
              </div>
            )}
          </div>

          {(activity.source !== 'manual' || activity.type === 'running') && (
            <ActivityDetails activityId={activity.id} />
          )}

          {activity.exercises && (activity.exercises as unknown as string).length > 0 && (() => {
            try {
              const exs: Array<{ name: string; sets: number; reps: number }> =
                typeof activity.exercises === 'string'
                  ? JSON.parse(activity.exercises as unknown as string)
                  : activity.exercises as unknown as Array<{ name: string; sets: number; reps: number }>
              if (!exs.length) return null
              return (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Übungen</p>
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
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Notizen</p>
              <p className="text-sm text-muted-foreground">{activity.notes}</p>
            </div>
          )}

          {activity.garminFileName && (
            <p className="text-xs text-muted-foreground/60">Quelle: {activity.garminFileName}</p>
          )}
        </div>
      )}

      <LogActivityModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={onChanged}
        activity={activity}
      />
    </div>
  )
}
