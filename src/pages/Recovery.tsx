import { useState, useEffect, useCallback } from 'react'
import { format, subDays } from 'date-fns'
import {
  Heart, Moon, Zap, Activity, ChevronLeft, ChevronRight,
  Save, Loader2, Trash2, TrendingUp, TrendingDown, Minus, Sparkles,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { RecoveryLog, UpsertRecoveryLogPayload } from '@/types/ipc'
import { calcReadiness } from '@/lib/recoveryScore'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_COLORS = {
  bodyBattery:    '#f97316',  // orange
  sleepScore:     '#3b82f6',  // blue
  readinessScore: '#10b981',  // green
  hrv:            '#8b5cf6',  // purple
  restingHr:      '#f43f5e',  // rose
}

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'hsl(var(--popover))',
  borderColor:     'hsl(var(--border))',
  borderRadius:    '10px',
  fontSize:        12,
  color:           'hsl(var(--popover-foreground))',
  boxShadow:       '0 8px 24px -4px rgba(0,0,0,0.15)',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

function parseNum(s: string): number | undefined {
  const trimmed = s.trim()
  if (!trimmed) return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Score color class: green ≥70, amber 40–69, red <40 */
function scoreColor(v: number | undefined): string {
  if (v == null) return 'text-muted-foreground'
  if (v >= 70)   return 'text-green-500'
  if (v >= 40)   return 'text-amber-500'
  return 'text-red-500'
}

function scoreBg(v: number | undefined): string {
  if (v == null) return 'bg-muted/50 border-border'
  if (v >= 70)   return 'bg-green-500/10 border-green-500/30'
  if (v >= 40)   return 'bg-amber-500/10 border-amber-500/30'
  return 'bg-red-500/10 border-red-500/30'
}

function trendIcon(values: (number | undefined)[], count = 7) {
  const recent = values.filter((v): v is number => v != null).slice(-count)
  if (recent.length < 2) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
  const delta = recent[recent.length - 1] - recent[0]
  if (delta > 2)  return <TrendingUp   className="h-3.5 w-3.5 text-green-500" />
  if (delta < -2) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

// ── Score card ────────────────────────────────────────────────────────────────

function ScoreCard({
  icon: Icon, label, value, unit = '', trend, auto = false,
}: {
  icon: React.ElementType
  label: string
  value?: number
  unit?: string
  trend?: React.ReactNode
  auto?: boolean
}) {
  return (
    <div className={cn(
      'flex-1 rounded-xl border p-4 flex flex-col items-center gap-1.5 transition-all',
      scoreBg(value),
    )}>
      <Icon className={cn('h-4 w-4', scoreColor(value))} />
      <p className={cn('text-2xl font-bold tabular-nums leading-none', scoreColor(value))}>
        {value != null ? Math.round(value) : '—'}
      </p>
      {unit && <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{unit}</p>}
      <p className="text-[10px] font-semibold text-muted-foreground text-center leading-tight">{label}</p>
      {auto && (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-500/70">
          <Sparkles className="h-2.5 w-2.5" /> auto
        </span>
      )}
      {trend && <div className="mt-0.5">{trend}</div>}
    </div>
  )
}

// ── Entry form ────────────────────────────────────────────────────────────────

function EntryForm({
  date, existing, onSaved, onDeleted,
}: {
  date: string
  existing?: RecoveryLog
  onSaved: (log: RecoveryLog) => void
  onDeleted?: () => void
}) {
  const [bb,         setBb]         = useState(existing?.bodyBattery != null ? String(existing.bodyBattery) : '')
  const [sleep,      setSleep]      = useState(existing?.sleepScore  != null ? String(existing.sleepScore)  : '')
  const [hrv,        setHrv]        = useState(existing?.hrvRmssd   != null ? String(existing.hrvRmssd)    : '')
  const [rhr,        setRhr]        = useState(existing?.restingHr  != null ? String(existing.restingHr)   : '')
  const [note,       setNote]       = useState(existing?.note       ?? '')
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  // Keep fields in sync when `existing` changes (date change)
  useEffect(() => {
    setBb(existing?.bodyBattery != null ? String(existing.bodyBattery) : '')
    setSleep(existing?.sleepScore  != null ? String(existing.sleepScore)  : '')
    setHrv(existing?.hrvRmssd   != null ? String(existing.hrvRmssd)    : '')
    setRhr(existing?.restingHr  != null ? String(existing.restingHr)   : '')
    setNote(existing?.note ?? '')
    setConfirmDel(false)
  }, [existing, date])

  const hasAnyValue = [bb, sleep, hrv, rhr].some(v => v.trim() !== '')

  // Live readiness preview while the user fills in values
  const liveReadiness = calcReadiness({
    bodyBattery: parseNum(bb),
    sleepScore:  parseNum(sleep),
    hrvRmssd:    parseNum(hrv),
    restingHr:   parseNum(rhr),
  })

  const save = async () => {
    if (!hasAnyValue) return
    setSaving(true)
    try {
      const payload: UpsertRecoveryLogPayload = {
        date,
        bodyBattery: parseNum(bb),
        sleepScore:  parseNum(sleep),
        hrvRmssd:    parseNum(hrv),
        restingHr:   parseNum(rhr),
        note:        note.trim() || undefined,
      }
      const log = await invoke<RecoveryLog>(IPC.RECOVERY_LOG_UPSERT, payload)
      onSaved(log)
    } catch { /* silent */ } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!existing) return
    if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return }
    try {
      await invoke(IPC.RECOVERY_LOG_DELETE, existing.id)
      onDeleted?.()
    } catch { /* silent */ }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {existing ? 'Edit today\'s entry' : 'Log today\'s recovery'}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="rec-bb" className="text-xs flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-orange-500" /> Body Battery (0–100)
          </Label>
          <Input id="rec-bb" type="number" min={0} max={100}
            placeholder="e.g. 82" value={bb}
            onChange={e => setBb(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rec-sleep" className="text-xs flex items-center gap-1.5">
            <Moon className="h-3 w-3 text-blue-500" /> Sleep Score (0–100)
          </Label>
          <Input id="rec-sleep" type="number" min={0} max={100}
            placeholder="e.g. 78" value={sleep}
            onChange={e => setSleep(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rec-hrv" className="text-xs flex items-center gap-1.5">
            <Heart className="h-3 w-3 text-violet-500" /> HRV RMSSD (ms)
          </Label>
          <Input id="rec-hrv" type="number" min={0} max={300} step={0.1}
            placeholder="e.g. 45" value={hrv}
            onChange={e => setHrv(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rec-rhr" className="text-xs flex items-center gap-1.5">
            <Heart className="h-3 w-3 text-rose-500" /> Resting HR (bpm)
          </Label>
          <Input id="rec-rhr" type="number" min={30} max={120}
            placeholder="e.g. 48" value={rhr}
            onChange={e => setRhr(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Note (optional)</Label>
          <Input id="rec-note" placeholder="e.g. Poor sleep, travel day"
            value={note} onChange={e => setNote(e.target.value)} />
        </div>

        {/* Live readiness preview */}
        <div className={cn(
          'flex flex-col items-center justify-center rounded-lg border px-3 py-2 gap-0.5 transition-all',
          liveReadiness != null
            ? liveReadiness >= 70
              ? 'border-green-500/30 bg-green-500/8'
              : liveReadiness >= 40
                ? 'border-amber-500/30 bg-amber-500/8'
                : 'border-red-500/30 bg-red-500/8'
            : 'border-border bg-muted/20'
        )}>
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-violet-400" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Readiness</span>
          </div>
          <p className={cn(
            'text-2xl font-bold tabular-nums leading-none',
            liveReadiness != null
              ? liveReadiness >= 70 ? 'text-green-500' : liveReadiness >= 40 ? 'text-amber-500' : 'text-red-500'
              : 'text-muted-foreground/30'
          )}>
            {liveReadiness != null ? liveReadiness : '—'}
          </p>
          <span className="text-[9px] text-violet-400/80 font-semibold">auto-calculated</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        {existing && (
          <button
            type="button"
            onClick={handleDelete}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              confirmDel
                ? 'bg-destructive/10 text-destructive'
                : 'text-muted-foreground/40 hover:text-destructive',
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmDel ? 'Confirm delete?' : 'Delete entry'}
          </button>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={save}
          disabled={saving || !hasAnyValue}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? 'Saving…' : existing ? 'Update' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

// ── Trend charts ──────────────────────────────────────────────────────────────

interface ChartPoint {
  label: string
  bodyBattery:    number | null
  sleepScore:     number | null
  readinessScore: number | null
  hrv:            number | null
  restingHr:      number | null
}

function buildChartData(logs: RecoveryLog[], days = 14): ChartPoint[] {
  const logMap = new Map(logs.map(l => [l.date, l]))
  return Array.from({ length: days }, (_, i) => {
    const d   = subDays(new Date(), days - 1 - i)
    const key = format(d, 'yyyy-MM-dd')
    const log = logMap.get(key)
    return {
      label:          format(d, 'MMM d'),
      bodyBattery:    log?.bodyBattery    ?? null,
      sleepScore:     log?.sleepScore     ?? null,
      readinessScore: log?.readinessScore ?? null,
      hrv:            log?.hrvRmssd       ?? null,
      restingHr:      log?.restingHr      ?? null,
    }
  })
}

function ScoreTrendChart({ data }: { data: ChartPoint[] }) {
  const hasAny = data.some(d => d.bodyBattery != null || d.sleepScore != null || d.readinessScore != null)
  if (!hasAny) return null

  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
        14-Day Score Trends
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
            interval={Math.floor(data.length / 5)} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Line
            type="monotone" dataKey="bodyBattery" name="Body Battery"
            stroke={CHART_COLORS.bodyBattery} strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.bodyBattery }}
            activeDot={{ r: 5 }} connectNulls={false}
          />
          <Line
            type="monotone" dataKey="sleepScore" name="Sleep Score"
            stroke={CHART_COLORS.sleepScore} strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.sleepScore }}
            activeDot={{ r: 5 }} connectNulls={false}
          />
          <Line
            type="monotone" dataKey="readinessScore" name="Readiness"
            stroke={CHART_COLORS.readinessScore} strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.readinessScore }}
            activeDot={{ r: 5 }} connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function HrvRhrChart({ data }: { data: ChartPoint[] }) {
  const hasHrv = data.some(d => d.hrv != null)
  const hasRhr = data.some(d => d.restingHr != null)
  if (!hasHrv && !hasRhr) return null

  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
        HRV & Resting HR Trends
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
            interval={Math.floor(data.length / 5)} />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          {hasHrv && (
            <Line
              type="monotone" dataKey="hrv" name="HRV RMSSD (ms)"
              stroke={CHART_COLORS.hrv} strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS.hrv }}
              activeDot={{ r: 5 }} connectNulls={false}
            />
          )}
          {hasRhr && (
            <Line
              type="monotone" dataKey="restingHr" name="Resting HR (bpm)"
              stroke={CHART_COLORS.restingHr} strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS.restingHr }}
              activeDot={{ r: 5 }} connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Recovery() {
  const [date,     setDate]     = useState(todayStr())
  const [logs,     setLogs]     = useState<RecoveryLog[]>([])
  const [loading,  setLoading]  = useState(true)

  const isToday   = date === todayStr()
  const todayLog  = logs.find(l => l.date === date)
  const chartData = buildChartData(logs, 14)

  // ── 7-day values for trend arrows ──────────────────────────────────────────
  const last7 = logs
    .filter(l => l.date >= format(subDays(new Date(), 6), 'yyyy-MM-dd'))
    .sort((a, b) => a.date.localeCompare(b.date))

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await invoke<RecoveryLog[]>(IPC.RECOVERY_LOGS_GET, {
        dateFrom: format(subDays(new Date(), 13), 'yyyy-MM-dd'),
        dateTo:   todayStr(),
      })
      setLogs(data)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSaved = (log: RecoveryLog) => {
    setLogs(prev => {
      const without = prev.filter(l => l.date !== log.date)
      return [...without, log].sort((a, b) => a.date.localeCompare(b.date))
    })
  }

  const handleDeleted = () => {
    setLogs(prev => prev.filter(l => l.date !== date))
  }

  const dateLabel = isToday
    ? 'Today'
    : format(new Date(date + 'T12:00:00'), 'EEE, MMM d')

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2.5 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8 max-w-2xl">

      {/* ── Header + date nav ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recovery</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track HRV, sleep, and readiness from your Garmin watch.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDate(format(subDays(new Date(date + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold w-28 text-center">{dateLabel}</span>
          <button
            onClick={() => setDate(format(subDays(new Date(date + 'T12:00:00'), -1), 'yyyy-MM-dd'))}
            disabled={isToday}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Score cards ────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <ScoreCard
          icon={Zap}
          label="Body Battery"
          value={todayLog?.bodyBattery}
          trend={trendIcon(last7.map(l => l.bodyBattery))}
        />
        <ScoreCard
          icon={Moon}
          label="Sleep Score"
          value={todayLog?.sleepScore}
          trend={trendIcon(last7.map(l => l.sleepScore))}
        />
        <ScoreCard
          icon={Activity}
          label="Readiness"
          value={todayLog?.readinessScore}
          trend={trendIcon(last7.map(l => l.readinessScore))}
          auto
        />
        <ScoreCard
          icon={Heart}
          label="HRV RMSSD"
          value={todayLog?.hrvRmssd}
          unit="ms"
          trend={trendIcon(last7.map(l => l.hrvRmssd))}
        />
        <ScoreCard
          icon={Heart}
          label="Resting HR"
          value={todayLog?.restingHr}
          unit="bpm"
        />
      </div>

      {/* ── Entry form ─────────────────────────────────────────────────── */}
      <EntryForm
        date={date}
        existing={todayLog}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />

      {/* ── Trend charts ───────────────────────────────────────────────── */}
      {logs.length > 0 && (
        <div className="space-y-4">
          <ScoreTrendChart data={chartData} />
          <HrvRhrChart data={chartData} />
        </div>
      )}

      {logs.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center space-y-2">
          <p className="text-3xl">💤</p>
          <p className="font-semibold text-sm">No recovery data yet</p>
          <p className="text-xs text-muted-foreground">
            Log your first entry above. Charts appear once you have data.
          </p>
        </div>
      )}
    </div>
  )
}
