import { useState, useEffect, useCallback } from 'react'
import { onDataChanged } from '@/lib/dataEvents'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  Plus, Activity, TrendingUp, Flame, Dumbbell,
  Moon, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogActivityModal } from '@/components/activities/LogActivityModal'
import { RecoveryWidget } from '@/components/recovery/RecoveryWidget'
import { FeelingPicker } from '@/components/recovery/FeelingPicker'
import { today } from '@/lib/today'
import { TodayPlanCard } from '@/components/dashboard/TodayPlanCard'
import { PlanWeekStrip } from '@/components/dashboard/PlanWeekStrip'
import { SessionDialog } from '@/components/plans/SessionDialog'
import { CoachCard } from '@/components/dashboard/CoachCard'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type {
  StatsResult, PlanTodayResult, UserProfile, RecoveryLog,
} from '@/types/ipc'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(min: number) {
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h} Std. ${m} min` : `${m} min`
}

const days = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Guten Morgen'
  if (h < 17) return 'Guten Tag'
  return 'Guten Abend'
}

// ── Accent system ─────────────────────────────────────────────────────────────

type AccentColor = 'blue' | 'green' | 'orange' | 'purple' | 'violet'
const ACCENT: Record<AccentColor, { iconBg: string; iconText: string; glow: string }> = {
  blue:   { iconBg: 'bg-blue-500/10',    iconText: 'text-blue-500',    glow: 'glow-blue'   },
  green:  { iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-500', glow: 'glow-green'  },
  orange: { iconBg: 'bg-orange-500/10',  iconText: 'text-orange-500',  glow: 'glow-orange' },
  purple: { iconBg: 'bg-violet-500/10',  iconText: 'text-violet-500',  glow: 'glow-purple' },
  violet: { iconBg: 'bg-indigo-500/10',  iconText: 'text-indigo-400',  glow: 'glow-purple' },
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">{label}</p>
      <div className="flex-1 h-px bg-border/60" />
      {action}
    </div>
  )
}

// ── Column header ─────────────────────────────────────────────────────────────

function ColHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">{label}</p>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: LucideIcon; color: AccentColor
}) {
  const c = ACCENT[color]
  return (
    <div className={cn('rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:scale-[1.01]', c.glow)}>
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', c.iconBg)}>
        <Icon className={cn('h-[18px] w-[18px]', c.iconText)} />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1 tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Goal bar ──────────────────────────────────────────────────────────────────

function GoalBar({ label, current, goal, unit }: {
  label: string; current: number; goal: number; unit: string
}) {
  const pct   = Math.min(Math.round((current / goal) * 100), 100)
  const done  = current >= goal
  const color = done ? 'hsl(var(--chart-2))' : pct >= 60 ? 'hsl(var(--chart-1))' : 'hsl(var(--muted-foreground))'
  return (
    <div className="vspace-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className="font-semibold" style={{ color }}>{current.toLocaleString('de-AT')}</span> / {goal.toLocaleString('de-AT')} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      {done && <p className="text-[11px] font-semibold text-green-500">✓ Ziel erreicht!</p>}
    </div>
  )
}

// ── Readiness alert ───────────────────────────────────────────────────────────

function ReadinessAlert({ score, onNavigate }: { score: number; onNavigate: () => void }) {
  if (score >= 70) return null
  const isRed = score < 40
  return (
    <button
      onClick={onNavigate}
      className={cn(
        'w-full rounded-xl border p-3.5 flex items-start gap-3 text-left transition-all hover:shadow-xs',
        isRed
          ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
          : 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50',
      )}
    >
      <AlertTriangle className={cn('h-4 w-4 shrink-0 mt-0.5', isRed ? 'text-red-500' : 'text-amber-500')} />
      <div className="min-w-0">
        <p className={cn('text-sm font-semibold', isRed ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
          Bereitschaft {score}/100 – {isRed ? 'Dein Körper braucht Ruhe' : 'Heute locker angehen'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isRed
            ? 'Ersetze die Einheit heute durch einen 20-Minuten-Spaziergang oder lass sie aus und schlaf dich aus.'
            : 'Kürze die Einheit um etwa 20 % und bleib im lockeren Pulsbereich (Zone 2).'}
        </p>
      </div>
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const todayStr = today()

  const [logOpen,       setLogOpen]       = useState(false)
  const [stats,         setStats]         = useState<StatsResult | null>(null)
  const [profile,       setProfile]       = useState<UserProfile | null>(null)
  const [planToday,     setPlanToday]     = useState<PlanTodayResult | null>(null)
  const [openSessionId, setOpenSessionId] = useState<number | null>(null)
  const [recoveryLog,   setRecoveryLog]   = useState<RecoveryLog | null>(null)

  const loadStats   = useCallback(() => {
    invoke(IPC.STATS_GET).then(s => setStats(s)).catch(() => {})
  }, [])
  const loadProfile = useCallback(() => {
    invoke(IPC.PROFILE_GET).then(p => setProfile(p)).catch(() => {})
  }, [])
  const loadPlan    = useCallback(() => {
    invoke(IPC.PLANS_TODAY).then(r => setPlanToday(r)).catch(() => {})
  }, [])

  const loadRecovery = useCallback(() => {
    invoke(IPC.RECOVERY_LOGS_GET, { dateFrom: todayStr, dateTo: todayStr })
      .then(logs => setRecoveryLog(logs[0] ?? null))
      .catch(() => {})
  }, [todayStr])

  useEffect(() => {
    loadStats(); loadProfile(); loadPlan(); loadRecovery()
  }, [loadStats, loadProfile, loadPlan, loadRecovery])

  // Nach Import/Sync neu laden
  useEffect(() => onDataChanged(() => { loadStats(); loadPlan(); loadRecovery() }),
    [loadStats, loadPlan, loadRecovery])

  const handleActivitySaved = useCallback(() => { setLogOpen(false); loadStats() }, [loadStats])
  const handlePlanChanged   = useCallback(() => { loadPlan(); loadStats() }, [loadPlan, loadStats])

  // ── Plan ────────────────────────────────────────────────────────────────────
  const openSession = planToday?.weekSessions.find(x => x.id === openSessionId) ?? null
  const todayTraining = planToday?.todaySessions.some(x => x.status === 'planned' && x.type !== 'rest') ?? false

  const hasData    = stats && (stats.totalActivities > 0 || stats.totalSleepSessions > 0)
  const weekBucket = stats?.weekly[stats.weekly.length - 1]

  return (
    <div className="p-8 vspace-8 max-w-5xl">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              {format(new Date(todayStr + 'T12:00:00'), 'EEEE, d. MMMM', { locale: de })}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              {greeting()}{profile?.name ? `, ${profile.name}` : ''}.
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {hasData
                ? `${stats.currentStreak > 0 ? `${days(stats.currentStreak)} in Folge 🔥 · ` : ''}${stats.totalActivities} ${stats.totalActivities === 1 ? 'Aktivität' : 'Aktivitäten'} insgesamt`
                : 'Trag deine erste Aktivität ein, dann wird es hier lebendig.'}
            </p>
          </div>
          <Button variant="gradient" onClick={() => setLogOpen(true)} className="shrink-0 mt-1">
            <Plus className="h-4 w-4 mr-2" /> Aktivität eintragen
          </Button>
        </div>

        {planToday && (
          <PlanWeekStrip data={planToday} onOpenSession={x => setOpenSessionId(x.id)} />
        )}
      </div>

      {/* ── Two-column Today section ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-6 items-start">

        {/* ── Left: Today's training ──────────────────────────────────── */}
        <div className="vspace-3">
          <ColHeader label="Heute" />

          {/* Readiness alert — shown only on training days when score is low */}
          {todayTraining && recoveryLog?.readinessScore != null && (
            <ReadinessAlert
              score={recoveryLog.readinessScore}
              onNavigate={() => navigate('/recovery')}
            />
          )}

          <CoachCard />

          {planToday && (
            <TodayPlanCard data={planToday} onOpenSession={x => setOpenSessionId(x.id)} />
          )}
        </div>

        {/* ── Right: Performance OS ────────────────────────────────────── */}
        <div className="vspace-3">
          <ColHeader label="Erholung" />

          <FeelingPicker
            date={todayStr}
            value={recoveryLog?.feeling ?? null}
            onChanged={loadRecovery}
          />

          {/* Recovery */}
          <RecoveryWidget />
        </div>
      </div>

      {/* ── Weekly goals ──────────────────────────────────────────────── */}
      {hasData && profile && (profile.weeklyGoalKm || profile.weeklyGoalSessions) && weekBucket && (
        <div>
          <SectionHeader
            label="Ziele dieser Woche"
            action={
              <button
                onClick={() => navigate('/settings')}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Ziele ändern
              </button>
            }
          />
          <div className="rounded-xl border bg-card p-5 vspace-5">
            {profile.weeklyGoalKm && (
              <GoalBar
                label="Laufstrecke"
                current={Math.round((weekBucket.runKm ?? 0) * 10) / 10}
                goal={profile.weeklyGoalKm}
                unit="km"
              />
            )}
            {profile.weeklyGoalSessions && (
              <GoalBar
                label="Trainingseinheiten"
                current={weekBucket.totalSessions}
                goal={profile.weeklyGoalSessions}
                unit={profile.weeklyGoalSessions === 1 ? 'Einheit' : 'Einheiten'}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Training stats ────────────────────────────────────────────── */}
      {hasData ? (
        <div className="vspace-8">
          <div>
            <SectionHeader label="Training gesamt" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Aktivitäten" value={stats.totalActivities}       icon={Activity}   color="blue"   />
              <StatCard label="Serie"        value={days(stats.currentStreak)}   icon={Flame}      color="orange" sub={`Beste: ${days(stats.longestStreak)}`} />
              <StatCard label="Laufstrecke" value={`${stats.totalRunKm.toLocaleString('de-AT', { maximumFractionDigits: 1 })} km`}    icon={TrendingUp} color="green"  sub={stats.totalRunMin > 0 ? fmt(stats.totalRunMin) : undefined} />
              <StatCard label="Kraft"         value={stats.totalStrengthSessions} icon={Dumbbell}   color="purple" />
            </div>
          </div>

          {stats.totalSleepSessions > 0 && (
            <div>
              <SectionHeader label="Schlaf" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="Erfasste Nächte" value={stats.totalSleepSessions} icon={Moon} color="violet" />
                {stats.avgSleepQuality != null && (
                  <StatCard
                    label="Ø Qualität"
                    value={`${stats.avgSleepQuality}/100`}
                    icon={Moon}
                    color="violet"
                    sub={
                      stats.avgSleepQuality >= 80 ? 'Ausgezeichnet' :
                      stats.avgSleepQuality >= 60 ? 'Gut' :
                      stats.avgSleepQuality >= 40 ? 'Mittel' : 'Schwach'
                    }
                  />
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-12 text-center vspace-5">
          <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20">
            <Activity className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="font-semibold text-lg">Noch keine Läufe</p>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
              Trag deinen ersten Lauf ein oder importiere eine Garmin-Datei. Danach siehst du hier deine Statistiken.
            </p>
          </div>
          <Button variant="gradient" onClick={() => setLogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Lauf eintragen
          </Button>
        </div>
      )}

      {planToday?.plan && openSession && (
        <SessionDialog
          key={openSession.id}
          plan={planToday.plan}
          session={openSession}
          create={null}
          today={planToday.today}
          onChanged={handlePlanChanged}
          onClose={() => setOpenSessionId(null)}
        />
      )}

      <LogActivityModal open={logOpen} onClose={() => setLogOpen(false)} onSaved={handleActivitySaved} />
    </div>
  )
}
