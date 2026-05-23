import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Plus, Activity, TrendingUp, Flame, Dumbbell,
  CalendarDays, ChevronRight, Moon, CheckCircle2,
  Zap, Timer, Heart, Sun, Check, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogActivityModal } from '@/components/activities/LogActivityModal'
import { HabitsWidget } from '@/components/habits/HabitsWidget'
import { NutritionWidget } from '@/components/nutrition/NutritionWidget'
import { RecoveryWidget } from '@/components/recovery/RecoveryWidget'
import { ChallengesWidget } from '@/components/challenges/ChallengesWidget'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type {
  StatsResult, PlanRow, PlanDetail, SessionRow, SessionType,
  UserProfile, DailyCheckin, RecoveryLog,
} from '@/types/ipc'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(min: number) {
  const h = Math.floor(min / 60); const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function todayPlanDow(): number { const d = new Date().getDay(); return d === 0 ? 7 : d }

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const DOW_LABEL: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
}

const SESSION_TYPE_ICON: Record<SessionType, LucideIcon> = {
  running: TrendingUp, cycling: Zap, strength: Dumbbell, rest: Moon, custom: Activity,
}

const SESSION_COLORS: Record<SessionType, { chip: string; iconBg: string; iconText: string; border: string; dot: string }> = {
  running:  { chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',           iconBg: 'bg-blue-500/10',    iconText: 'text-blue-500',    border: 'border-blue-500/30',    dot: 'bg-blue-500'    },
  cycling:  { chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',   iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-500', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  strength: { chip: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',      iconBg: 'bg-orange-500/10',  iconText: 'text-orange-500',  border: 'border-orange-500/30',  dot: 'bg-orange-500'  },
  rest:     { chip: 'bg-slate-500/10 text-slate-500',                             iconBg: 'bg-slate-500/10',   iconText: 'text-slate-400',   border: 'border-slate-400/30',   dot: 'bg-slate-400'   },
  custom:   { chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',      iconBg: 'bg-violet-500/10',  iconText: 'text-violet-500',  border: 'border-violet-500/30',  dot: 'bg-violet-500'  },
}

function flatSessions(plan: PlanDetail): SessionRow[] {
  return plan.phases
    .slice().sort((a, b) => a.orderIndex - b.orderIndex)
    .flatMap(p => p.weeks.slice().sort((a, b) => a.weekNumber - b.weekNumber).flatMap(w => w.sessions))
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

// ── Week bar ──────────────────────────────────────────────────────────────────

function WeekBar({ allSessions, todayDow }: { allSessions: SessionRow[]; todayDow: number }) {
  const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5, 6, 7].map((dow, i) => {
        const sessions   = allSessions.filter(s => s.dayOfWeek === dow)
        const completed  = sessions.find(s => s.status === 'completed')
        const planned    = sessions.find(s => s.status === 'planned')
        const isToday    = dow === todayDow
        const isPast     = dow < todayDow

        return (
          <div key={dow} className="flex flex-col items-center gap-1.5 w-7">
            <div className={cn(
              'rounded-full transition-all duration-200',
              isToday ? 'w-3.5 h-3.5 ring-2 ring-primary ring-offset-1 ring-offset-background' : 'w-2.5 h-2.5',
              completed
                ? SESSION_COLORS[completed.type].dot
                : planned
                ? cn('border-2', isPast ? 'border-muted-foreground/30 bg-transparent' : 'border-primary/40 bg-primary/10')
                : 'bg-muted/40',
            )} />
            <span className={cn(
              'text-[9px] font-bold uppercase leading-none select-none',
              isToday ? 'text-foreground' : 'text-muted-foreground/40',
            )}>
              {WEEK_LABELS[i]}
            </span>
          </div>
        )
      })}
    </div>
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

// ── Today's session card ──────────────────────────────────────────────────────

function TodayCard({ session, onDone }: { session: SessionRow; onDone: () => void }) {
  const [showNote, setShowNote] = useState(false)
  const [note,     setNote]     = useState('')
  const [marking,  setMarking]  = useState(false)
  const colors = SESSION_COLORS[session.type]
  const Icon   = SESSION_TYPE_ICON[session.type]

  const markDone = async () => {
    setMarking(true)
    try {
      await invoke(IPC.SESSIONS_UPDATE_STATUS, {
        sessionId: session.id, status: 'completed', completedAt: Date.now(),
        completionNote: note.trim() || undefined,
      })
      onDone()
    } catch { /* ignore */ } finally { setMarking(false) }
  }

  return (
    <div className={cn('rounded-xl border-2 bg-card overflow-hidden', colors.border)}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', colors.iconBg)}>
            <Icon className={cn('h-5 w-5', colors.iconText)} />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Today · {DOW_LABEL[session.dayOfWeek]}
              </span>
              <span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize', colors.chip)}>
                {session.type}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
              {session.targetDurationMin && (
                <span className="flex items-center gap-1">
                  <Timer className="h-3.5 w-3.5" />{fmt(session.targetDurationMin)}
                </span>
              )}
              {session.targetHrZone && (
                <span className="flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" />Zone {session.targetHrZone}
                </span>
              )}
              {session.intensityLabel && (
                <span className="text-muted-foreground/70">· {session.intensityLabel}</span>
              )}
            </div>
          </div>
          <Button
            size="sm" variant="gradient" className="shrink-0 gap-1.5"
            onClick={() => setShowNote(v => !v)} disabled={marking}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Done
          </Button>
        </div>
        {session.coachingNote && (
          <p className="mt-3 text-xs text-muted-foreground italic border-l-2 border-border pl-3 leading-relaxed">
            {session.coachingNote}
          </p>
        )}
        {showNote && (
          <div className="mt-4 space-y-3 pt-4 border-t border-border/60">
            <p className="text-xs font-medium text-muted-foreground">Add a note (optional)</p>
            <textarea
              className="w-full rounded-lg border bg-muted/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
              placeholder="How did it feel? Any PRs?"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowNote(false)} disabled={marking}>
                Cancel
              </Button>
              <Button size="sm" variant="gradient" onClick={markDone} disabled={marking}>
                {marking ? 'Saving…' : 'Save & Complete'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Rest day card ─────────────────────────────────────────────────────────────

function RestDayCard({ planName }: { planName: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-slate-500/10 flex items-center justify-center shrink-0">
        <Moon className="h-5 w-5 text-slate-400" />
      </div>
      <div>
        <p className="font-semibold">Rest day</p>
        <p className="text-xs text-muted-foreground mt-0.5">{planName} · No training today.</p>
        <p className="text-xs text-muted-foreground">Focus on recovery and sleep.</p>
      </div>
    </div>
  )
}

// ── No-plan card ──────────────────────────────────────────────────────────────

function NoPlanCard({ onNavigate }: { onNavigate: () => void }) {
  return (
    <button
      onClick={onNavigate}
      className="group w-full flex items-center gap-4 rounded-xl border border-dashed border-border bg-card p-5 text-left hover:border-primary/40 transition-all"
    >
      <div className="w-11 h-11 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
        <CalendarDays className="h-5 w-5 text-violet-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">No training plan active</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Create or import a plan to see today's session here →
        </p>
      </div>
    </button>
  )
}

// ── Upcoming list ─────────────────────────────────────────────────────────────

function UpcomingList({ sessions }: { sessions: SessionRow[] }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border/60">
      {sessions.map(s => {
        const colors = SESSION_COLORS[s.type]
        const Icon   = SESSION_TYPE_ICON[s.type]
        return (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-xs font-bold text-muted-foreground w-7 shrink-0 tabular-nums">
              {DOW_LABEL[s.dayOfWeek]}
            </span>
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', colors.iconBg)}>
              <Icon className={cn('h-3.5 w-3.5', colors.iconText)} />
            </div>
            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full capitalize', colors.chip)}>
              {s.type}
            </span>
            <div className="flex items-center gap-2 flex-1 min-w-0 text-xs text-muted-foreground">
              {s.targetDurationMin && <span>{fmt(s.targetDurationMin)}</span>}
              {s.targetHrZone && <span>Z{s.targetHrZone}</span>}
              {s.intensityLabel && <span className="truncate">{s.intensityLabel}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Check-in banner ───────────────────────────────────────────────────────────

function CheckinBanner({ checkin, onNavigate }: { checkin: DailyCheckin | null; onNavigate: () => void }) {
  const morningDone = !!(checkin?.morningEnergy)
  const eveningDone = !!(checkin?.eveningRating)
  const hour        = new Date().getHours()

  if (morningDone && eveningDone) {
    return (
      <button
        onClick={onNavigate}
        className="group flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 p-3.5 w-full text-left hover:shadow-sm transition-all"
      >
        <Check className="h-4 w-4 text-green-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-600 dark:text-green-400">Check-in complete</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Energy {checkin!.morningEnergy}/5 · Clarity {checkin!.morningClarity}/5 · Day {checkin!.eveningRating}/5
          </p>
        </div>
      </button>
    )
  }

  if (morningDone) {
    return (
      <button
        onClick={onNavigate}
        className="group flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 w-full text-left hover:shadow-sm transition-all"
      >
        <div className="flex flex-col items-center gap-0.5 shrink-0 w-8">
          <Check className="h-3.5 w-3.5 text-green-500" />
          <Moon className="h-3 w-3 text-amber-500/70" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
            Evening reflection due
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Energy {checkin!.morningEnergy}/5 · Clarity {checkin!.morningClarity}/5
          </p>
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={onNavigate}
      className="group flex items-center gap-3 rounded-xl border border-dashed border-border bg-card p-3.5 w-full text-left hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
        {hour < 17
          ? <Sun className="h-4 w-4 text-orange-500" />
          : <Moon className="h-4 w-4 text-violet-500" />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold">Morning check-in pending</p>
        <p className="text-xs text-muted-foreground mt-0.5">Energy, clarity & intentions →</p>
      </div>
    </button>
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className="font-semibold" style={{ color }}>{current}</span> / {goal} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      {done && <p className="text-[11px] font-semibold text-green-500">✓ Goal reached!</p>}
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
        'w-full rounded-xl border p-3.5 flex items-start gap-3 text-left transition-all hover:shadow-sm',
        isRed
          ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
          : 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50',
      )}
    >
      <AlertTriangle className={cn('h-4 w-4 shrink-0 mt-0.5', isRed ? 'text-red-500' : 'text-amber-500')} />
      <div className="min-w-0">
        <p className={cn('text-sm font-semibold', isRed ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
          Readiness {score}/100 — {isRed ? 'Body says rest' : 'Take it easy today'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isRed
            ? "Replace today's session with a 20-min walk, or skip and prioritise sleep."
            : 'Reduce duration ~20% and keep HR in Z2. Quality over volume.'}
        </p>
      </div>
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const [logOpen,       setLogOpen]       = useState(false)
  const [stats,         setStats]         = useState<StatsResult | null>(null)
  const [profile,       setProfile]       = useState<UserProfile | null>(null)
  const [activePlan,    setActivePlan]    = useState<PlanRow | null>(null)
  const [planDetail,    setPlanDetail]    = useState<PlanDetail | null>(null)
  const [checkin,       setCheckin]       = useState<DailyCheckin | null>(null)
  const [checkinLoaded, setCheckinLoaded] = useState(false)
  const [recoveryLog,   setRecoveryLog]   = useState<RecoveryLog | null>(null)

  const loadStats   = useCallback(() => {
    invoke<StatsResult>(IPC.STATS_GET).then(s => setStats(s)).catch(() => {})
  }, [])
  const loadProfile = useCallback(() => {
    invoke<UserProfile | null>(IPC.PROFILE_GET).then(p => setProfile(p)).catch(() => {})
  }, [])
  const loadPlan    = useCallback(async () => {
    try {
      const plans  = await invoke<PlanRow[]>(IPC.PLANS_LIST)
      const active = plans.find(p => p.isActive === 1) ?? null
      setActivePlan(active)
      if (active) {
        const d = await invoke<PlanDetail | null>(IPC.PLANS_GET, active.id)
        setPlanDetail(d)
      } else {
        setPlanDetail(null)
      }
    } catch { /* optional */ }
  }, [])
  const loadCheckin = useCallback(() => {
    invoke<DailyCheckin | null>(IPC.CHECKIN_GET, todayStr)
      .then(c => { setCheckin(c); setCheckinLoaded(true) })
      .catch(() => { setCheckinLoaded(true) })
  }, [todayStr])

  const loadRecovery = useCallback(() => {
    invoke<RecoveryLog[]>(IPC.RECOVERY_LOGS_GET, { dateFrom: todayStr, dateTo: todayStr })
      .then(logs => setRecoveryLog(logs[0] ?? null))
      .catch(() => {})
  }, [todayStr])

  useEffect(() => {
    loadStats(); loadProfile(); loadPlan(); loadCheckin(); loadRecovery()
  }, [loadStats, loadProfile, loadPlan, loadCheckin, loadRecovery])

  const handleActivitySaved = useCallback(() => { setLogOpen(false); loadStats() }, [loadStats])
  const handleSessionDone   = useCallback(() => { loadPlan(); loadStats() }, [loadPlan, loadStats])

  // ── Plan logic ──────────────────────────────────────────────────────────────
  const todayDow       = todayPlanDow()
  const allSessions    = planDetail ? flatSessions(planDetail) : []
  const allPlanned     = allSessions.filter(s => s.status === 'planned')
  const todaySession   = allPlanned.find(s => s.dayOfWeek === todayDow) ?? null

  const upcomingSessions: SessionRow[] = []
  for (let offset = 1; offset <= 6 && upcomingSessions.length < 3; offset++) {
    const dow   = ((todayDow - 1 + offset) % 7) + 1
    const found = allPlanned.find(s => s.dayOfWeek === dow && s !== todaySession)
    if (found) upcomingSessions.push(found)
  }

  const hasData    = stats && (stats.totalActivities > 0 || stats.totalSleepSessions > 0)
  const weekBucket = stats?.weekly[stats.weekly.length - 1]

  return (
    <div className="p-8 space-y-8 max-w-5xl">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              {format(new Date(), 'EEEE, MMMM d')}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              {greeting()}{profile?.name ? `, ${profile.name}` : ''}.
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {hasData
                ? `${stats.currentStreak > 0 ? `${stats.currentStreak}-day streak 🔥 · ` : ''}${stats.totalActivities} total ${stats.totalActivities === 1 ? 'activity' : 'activities'}`
                : 'Your command center for becoming elite.'}
            </p>
          </div>
          <Button variant="gradient" onClick={() => setLogOpen(true)} className="shrink-0 mt-1">
            <Plus className="h-4 w-4 mr-2" /> Log Activity
          </Button>
        </div>

        {/* Week bar — shown when an active plan exists */}
        {activePlan && allSessions.length > 0 && (
          <div className="mt-5 flex items-center gap-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">
              This week
            </p>
            <WeekBar allSessions={allSessions} todayDow={todayDow} />
            <div className="flex-1" />
            <button
              onClick={() => navigate(`/plan/${activePlan.id}`)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              {activePlan.name} <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* ── Two-column Today section ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-6 items-start">

        {/* ── Left: Today's training ──────────────────────────────────── */}
        <div className="space-y-3">
          <ColHeader label="Today's training" />

          {/* Readiness alert — shown only on training days when score is low */}
          {activePlan && todaySession && recoveryLog?.readinessScore != null && (
            <ReadinessAlert
              score={recoveryLog.readinessScore}
              onNavigate={() => navigate('/recovery')}
            />
          )}

          {activePlan && todaySession ? (
            <TodayCard session={todaySession} onDone={handleSessionDone} />
          ) : activePlan ? (
            <RestDayCard planName={activePlan.name} />
          ) : (
            <NoPlanCard onNavigate={() => navigate('/plan')} />
          )}

          {/* Upcoming sessions */}
          {activePlan && upcomingSessions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {todaySession ? 'Coming up this week' : 'Next up'}
              </p>
              <UpcomingList sessions={upcomingSessions} />
            </div>
          )}
        </div>

        {/* ── Right: Performance OS ────────────────────────────────────── */}
        <div className="space-y-3">
          <ColHeader label="Performance OS" />

          {/* Check-in banner */}
          {checkinLoaded && (
            <CheckinBanner checkin={checkin} onNavigate={() => navigate('/checkin')} />
          )}

          {/* Habits */}
          <HabitsWidget />

          {/* Recovery */}
          <RecoveryWidget />

          {/* Nutrition */}
          <NutritionWidget />

          {/* Challenges */}
          <ChallengesWidget />

          {/* Empty right-column state */}
          {checkinLoaded && !checkin?.morningEnergy && (
            // Only show if nothing else rendered in this column
            <span />
          )}
        </div>
      </div>

      {/* ── Weekly goals ──────────────────────────────────────────────── */}
      {hasData && profile && (profile.weeklyGoalKm || profile.weeklyGoalSessions) && weekBucket && (
        <div>
          <SectionHeader
            label="This week's goals"
            action={
              <button
                onClick={() => navigate('/settings')}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit goals
              </button>
            }
          />
          <div className="rounded-xl border bg-card p-5 space-y-5">
            {profile.weeklyGoalKm && (
              <GoalBar
                label="Running distance"
                current={Math.round((weekBucket.runKm ?? 0) * 10) / 10}
                goal={profile.weeklyGoalKm}
                unit="km"
              />
            )}
            {profile.weeklyGoalSessions && (
              <GoalBar
                label="Training sessions"
                current={weekBucket.totalSessions}
                goal={profile.weeklyGoalSessions}
                unit={profile.weeklyGoalSessions === 1 ? 'session' : 'sessions'}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Training stats ────────────────────────────────────────────── */}
      {hasData ? (
        <div className="space-y-8">
          <div>
            <SectionHeader label="All-time training" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Activities"   value={stats.totalActivities}       icon={Activity}   color="blue"   />
              <StatCard label="Streak"       value={`${stats.currentStreak}d`}   icon={Flame}      color="orange" sub={`Best: ${stats.longestStreak}d`} />
              <StatCard label="Run Distance" value={`${stats.totalRunKm} km`}    icon={TrendingUp} color="green"  sub={stats.totalRunMin > 0 ? fmt(stats.totalRunMin) : undefined} />
              <StatCard label="Strength"     value={stats.totalStrengthSessions} icon={Dumbbell}   color="purple" />
            </div>
          </div>

          {stats.totalSleepSessions > 0 && (
            <div>
              <SectionHeader label="Sleep" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="Nights Logged" value={stats.totalSleepSessions} icon={Moon} color="violet" />
                {stats.avgSleepQuality != null && (
                  <StatCard
                    label="Avg Quality"
                    value={`${stats.avgSleepQuality}/100`}
                    icon={Moon}
                    color="violet"
                    sub={
                      stats.avgSleepQuality >= 80 ? 'Excellent' :
                      stats.avgSleepQuality >= 60 ? 'Good' :
                      stats.avgSleepQuality >= 40 ? 'Fair' : 'Poor'
                    }
                  />
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-12 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20">
            <Activity className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="font-semibold text-lg">Ready to begin?</p>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
              Log a workout, set up habits, and start your daily check-in to unlock your command center.
            </p>
          </div>
          <Button variant="gradient" onClick={() => setLogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Log your first activity
          </Button>
        </div>
      )}

      <LogActivityModal open={logOpen} onClose={() => setLogOpen(false)} onSaved={handleActivitySaved} />
    </div>
  )
}
