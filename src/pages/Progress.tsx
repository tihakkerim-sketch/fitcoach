import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import {
  Activity, TrendingUp, Zap, Dumbbell, Flame, Trophy, Heart, Medal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { StatsResult } from '@/types/ipc'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// ── Design tokens ─────────────────────────────────────────────────────────────

const CHART = {
  run:      '#3b82f6',
  cycle:    '#10b981',
  strength: '#f97316',
  other:    '#8b5cf6',
  load:     '#8b5cf6',
}

const ZONE_COLORS: Record<string, string> = {
  Z1: '#22c55e', Z2: '#3b82f6', Z3: '#f59e0b', Z4: '#f97316', Z5: '#ef4444', 'No HR': '#9ca3af',
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ef4444', '#94a3b8']

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'hsl(var(--popover))',
  borderColor:     'hsl(var(--border))',
  borderRadius:    '10px',
  fontSize:        12,
  color:           'hsl(var(--popover-foreground))',
  boxShadow:       '0 8px 24px -4px rgba(0,0,0,0.15)',
}

const axisStyle = { fontSize: 11 }
const GRID_LINE = 'hsl(var(--border))'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch { return dateStr }
}

// ── Accent system ─────────────────────────────────────────────────────────────

type AccentColor = 'blue' | 'green' | 'orange' | 'purple' | 'rose' | 'amber'

const ACCENT: Record<AccentColor, { iconBg: string; iconText: string; glow: string }> = {
  blue:   { iconBg: 'bg-blue-500/10',    iconText: 'text-blue-500',    glow: 'glow-blue'   },
  green:  { iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-500', glow: 'glow-green'  },
  orange: { iconBg: 'bg-orange-500/10',  iconText: 'text-orange-500',  glow: 'glow-orange' },
  purple: { iconBg: 'bg-violet-500/10',  iconText: 'text-violet-500',  glow: 'glow-purple' },
  rose:   { iconBg: 'bg-rose-500/10',    iconText: 'text-rose-500',    glow: 'glow-rose'   },
  amber:  { iconBg: 'bg-amber-500/10',   iconText: 'text-amber-500',   glow: 'glow-amber'  },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: LucideIcon; color: AccentColor
}) {
  const c = ACCENT[color]
  return (
    <div className={cn('rounded-xl border bg-card p-5 transition-all hover:shadow-sm', c.glow)}>
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-4', c.iconBg)}>
        <Icon className={cn('h-5 w-5', c.iconText)} />
      </div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold mt-1.5 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function PRCard({ label, value, date, icon: Icon, color }: {
  label: string; value: string; date?: string | null
  icon: LucideIcon; color: AccentColor
}) {
  const c = ACCENT[color]
  return (
    <div className={cn('rounded-xl border bg-card p-5', c.glow)}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', c.iconBg)}>
          <Icon className={cn('h-4 w-4', c.iconText)} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          PR
        </span>
      </div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1.5 tracking-tight">{value}</p>
      {date && <p className="text-xs text-muted-foreground mt-1">{date}</p>}
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-semibold text-base">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Progress() {
  const [stats, setStats] = useState<StatsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    invoke<StatsResult>(IPC.STATS_GET)
      .then(s  => setStats(s))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load stats'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      Loading stats…
    </div>
  )
  if (error) return (
    <div className="flex items-center justify-center h-full text-destructive text-sm">{error}</div>
  )
  if (!stats) return null

  const noData = stats.totalActivities === 0
  const pr     = stats.personalRecords
  const hasPRs = pr.fastestPaceSecPerKm !== null || pr.longestRunKm !== null || pr.bestWeekKm !== null
  const hasPaceData = stats.weekly.some(w => w.avgPaceSecPerKm !== null)
  const hasLoadData = stats.weekly.some(w => w.trainingLoad > 0)

  return (
    <ScrollArea className="h-full">
      <div className="p-8 space-y-8 max-w-5xl">

        {/* Page header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Progress</h1>
          <p className="text-muted-foreground mt-1">Your training at a glance</p>
        </div>

        {/* Empty state */}
        {noData && (
          <div className="rounded-2xl border bg-card p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto">
              <Activity className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="font-semibold">No activities yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Start logging workouts to see your progress here.
              </p>
            </div>
          </div>
        )}

        {/* ── Stat cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Total Activities"  value={stats.totalActivities}          icon={Activity}   color="blue"   />
          <StatCard label="Run Distance"      value={`${stats.totalRunKm} km`}        icon={TrendingUp} color="green"  sub={stats.totalRunMin > 0 ? fmt(stats.totalRunMin) : undefined} />
          <StatCard label="Cycle Distance"    value={`${stats.totalCycleKm} km`}      icon={Zap}        color="orange" />
          <StatCard label="Strength Sessions" value={stats.totalStrengthSessions}     icon={Dumbbell}   color="purple" />
          <StatCard label="Current Streak"    value={`${stats.currentStreak} days`}   icon={Flame}      color="orange" />
          <StatCard label="Longest Streak"    value={`${stats.longestStreak} days`}   icon={Trophy}     color="amber"  />
          {stats.avgRunHr && (
            <StatCard label="Avg Run HR"      value={`${stats.avgRunHr} bpm`}         icon={Heart}      color="rose"   />
          )}
        </div>

        {!noData && (
          <>
            {/* ── Personal Records ─────────────────────────────────── */}
            {hasPRs && (
              <div>
                <SectionHeader
                  title="Personal Records"
                  subtitle="Your all-time bests"
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {pr.fastestPaceSecPerKm !== null && (
                    <PRCard
                      icon={Zap}
                      color="blue"
                      label="Fastest Pace"
                      value={formatPace(pr.fastestPaceSecPerKm) + ' /km'}
                      date={pr.fastestPaceDate ? fmtDate(pr.fastestPaceDate) : undefined}
                    />
                  )}
                  {pr.longestRunKm !== null && (
                    <PRCard
                      icon={TrendingUp}
                      color="green"
                      label="Longest Run"
                      value={`${pr.longestRunKm.toFixed(2)} km`}
                      date={pr.longestRunDate ? fmtDate(pr.longestRunDate) : undefined}
                    />
                  )}
                  {pr.bestWeekKm !== null && (
                    <PRCard
                      icon={Medal}
                      color="amber"
                      label="Best Week"
                      value={`${pr.bestWeekKm.toFixed(1)} km`}
                      date={pr.bestWeekLabel ?? undefined}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ── Weekly distance ───────────────────────────────────── */}
            <div className="rounded-xl border bg-card p-6">
              <SectionHeader title="Weekly Distance" subtitle="Running & cycling — last 12 weeks" />
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.weekly} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} vertical={false} />
                  <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis unit=" km"      tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: number, name: string) => [`${v.toFixed(1)} km`, name]}
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'hsl(var(--muted))' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 14 }} />
                  <Bar dataKey="runKm"   name="Running" fill={CHART.run}   radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cycleKm" name="Cycling" fill={CHART.cycle} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Weekly training time ──────────────────────────────── */}
            <div className="rounded-xl border bg-card p-6">
              <SectionHeader title="Weekly Training Time" subtitle="Minutes per week — last 12 weeks" />
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={stats.weekly} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} vertical={false} />
                  <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis unit=" min"     tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: number, name: string) => [fmt(v), name]}
                    contentStyle={tooltipStyle}
                    cursor={{ stroke: 'hsl(var(--border))' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 14 }} />
                  <Line type="monotone" dataKey="runMin"   name="Running" stroke={CHART.run}   strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="otherMin" name="Other"   stroke={CHART.other} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* ── Training load ─────────────────────────────────────── */}
            {hasLoadData && (
              <div className="rounded-xl border bg-card p-6">
                <SectionHeader
                  title="Training Load"
                  subtitle="Duration × intensity score per week — higher means harder"
                />
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.weekly} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} vertical={false} />
                    <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis              tick={axisStyle} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: number) => [v.toLocaleString(), 'Load']}
                      contentStyle={tooltipStyle}
                      cursor={{ fill: 'hsl(var(--muted))' }}
                    />
                    <Bar dataKey="trainingLoad" name="Load" fill={CHART.load} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Pace trend ────────────────────────────────────────── */}
            {hasPaceData && (
              <div className="rounded-xl border bg-card p-6">
                <SectionHeader
                  title="Running Pace Trend"
                  subtitle="Average pace per week — lower line = faster"
                />
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={stats.weekly} margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} vertical={false} />
                    <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis
                      reversed
                      tick={axisStyle}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formatPace(v)}
                      width={42}
                    />
                    <Tooltip
                      formatter={(v: unknown) => {
                        const n = typeof v === 'number' && v > 0 ? v : null
                        return [n ? formatPace(n) + ' /km' : '—', 'Pace']
                      }}
                      contentStyle={tooltipStyle}
                      cursor={{ stroke: 'hsl(var(--border))' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgPaceSecPerKm"
                      name="Pace"
                      stroke={CHART.run}
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Breakdown + HR zones ──────────────────────────────── */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {stats.byType.length > 0 && (
                <div className="rounded-xl border bg-card p-6">
                  <SectionHeader title="Activity Breakdown" />
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={stats.byType}
                        dataKey="count"
                        nameKey="type"
                        cx="50%" cy="50%"
                        outerRadius={80} innerRadius={38}
                        paddingAngle={3}
                        label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {stats.byType.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {stats.zones.some(z => z.minutes > 0) && (
                <div className="rounded-xl border bg-card p-6">
                  <SectionHeader title="HR Zone Distribution" subtitle="Last 12 weeks" />
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats.zones} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} horizontal={false} />
                      <XAxis type="number" unit=" min" tick={axisStyle} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="zone" tick={{ fontSize: 12 }} width={32} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: number) => [fmt(v), 'Time']}
                        contentStyle={tooltipStyle}
                        cursor={{ fill: 'hsl(var(--muted))' }}
                      />
                      <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                        {stats.zones.map((z, i) => (
                          <Cell key={i} fill={ZONE_COLORS[z.zone] ?? '#6b7280'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* ── Strength sessions per week ────────────────────────── */}
            {stats.weekly.some(w => w.strengthSessions > 0) && (
              <div className="rounded-xl border bg-card p-6">
                <SectionHeader title="Strength Sessions per Week" />
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={stats.weekly} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} vertical={false} />
                    <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={axisStyle} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} />
                    <Bar dataKey="strengthSessions" name="Sessions" fill={CHART.strength} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        <div className="h-4" />
      </div>
    </ScrollArea>
  )
}
