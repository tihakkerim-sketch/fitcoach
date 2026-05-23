import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { Trash2, TrendingDown, TrendingUp, Minus, AlertCircle, Loader2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { BodyMetricRow, CreateBodyMetricPayload } from '@/types/ipc'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a numeric input string. Returns undefined for empty, NaN-safe. */
function parseNum(s: string): number | undefined {
  if (!s.trim()) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

/** Round to 1 decimal place. */
function r1(n: number): number { return Math.round(n * 10) / 10 }

// ── Log form ──────────────────────────────────────────────────────────────────

function LogForm({
  existingDates,
  onSaved,
}: {
  existingDates: Set<string>
  onSaved: () => void
}) {
  const [date,    setDate]    = useState(format(new Date(), 'yyyy-MM-dd'))
  const [weight,  setWeight]  = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const hasEntry    = existingDates.has(date)
  const weightNum   = parseNum(weight)
  const bodyFatNum  = parseNum(bodyFat)
  const canSave     = (weightNum != null || bodyFatNum != null) && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const payload: CreateBodyMetricPayload = {
        date,
        weightKg:   weightNum   != null ? r1(weightNum)   : undefined,
        bodyFatPct: bodyFatNum  != null ? r1(bodyFatNum)  : undefined,
        note:       note.trim() || undefined,
      }
      await invoke(IPC.BODY_CREATE, payload)
      setWeight(''); setBodyFat(''); setNote('')
      onSaved()
    } catch {
      setError('Could not save entry. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <h2 className="font-semibold text-sm uppercase tracking-widest text-muted-foreground">
        Log Entry
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="body-date" className="text-xs">Date</Label>
          <Input
            id="body-date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          {hasEntry && (
            <p className="text-[11px] text-amber-500 leading-tight">
              ⚠ Entry exists for this date
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="body-weight" className="text-xs">Weight (kg)</Label>
          <Input
            id="body-weight"
            type="number"
            step="0.1"
            min={20}
            max={300}
            placeholder="75.0"
            value={weight}
            onChange={e => { setWeight(e.target.value); setError(null) }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="body-fat" className="text-xs">Body fat %</Label>
          <Input
            id="body-fat"
            type="number"
            step="0.1"
            min={1}
            max={60}
            placeholder="15.0"
            value={bodyFat}
            onChange={e => { setBodyFat(e.target.value); setError(null) }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="body-note" className="text-xs">Note</Label>
          <Input
            id="body-note"
            placeholder="Morning, fasted…"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!canSave} size="sm">
          {saving ? (
            <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Saving…</>
          ) : (
            'Log'
          )}
        </Button>
        {!canSave && !saving && (
          <p className="text-xs text-muted-foreground">Enter at least one measurement</p>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  )
}

// ── Trend indicator ───────────────────────────────────────────────────────────

function Trend({
  current, previous, unit, goodDirection = 'down',
}: {
  current: number
  previous: number
  unit: string
  /** 'down' means losing is good (weight, body fat); 'up' means gaining is good (strength) */
  goodDirection?: 'down' | 'up'
}) {
  const delta = current - previous
  if (Math.abs(delta) < 0.05) {
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
  }
  const isDown = delta < 0
  const isGood = goodDirection === 'down' ? isDown : !isDown
  return (
    <span className={cn('flex items-center gap-0.5 text-xs font-medium', isGood ? 'text-green-500' : 'text-red-400')}>
      {isDown
        ? <TrendingDown className="h-3.5 w-3.5" />
        : <TrendingUp   className="h-3.5 w-3.5" />
      }
      {Math.abs(delta).toFixed(1)}{unit}
    </span>
  )
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({
  row,
  onDelete,
}: {
  row: BodyMetricRow
  onDelete: (id: number) => void
}) {
  const [awaitingDelete, setAwaitingDelete] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDeleteClick = () => {
    if (!awaitingDelete) {
      setAwaitingDelete(true)
      timerRef.current = setTimeout(() => setAwaitingDelete(false), 3000)
    } else {
      if (timerRef.current) clearTimeout(timerRef.current)
      setAwaitingDelete(false)
      onDelete(row.id)
    }
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <div className="flex items-center gap-4 px-4 py-3 text-sm">
      <span className="text-muted-foreground tabular-nums w-24 shrink-0">{row.date}</span>
      {row.weightKg   != null && <span className="font-medium tabular-nums">{row.weightKg.toFixed(1)} kg</span>}
      {row.bodyFatPct != null && <span className="text-muted-foreground tabular-nums">{row.bodyFatPct.toFixed(1)}%</span>}
      {row.note        && <span className="text-muted-foreground/70 text-xs truncate flex-1">{row.note}</span>}
      <div className="flex-1" />
      <button
        type="button"
        onClick={handleDeleteClick}
        className={cn(
          'shrink-0 rounded px-2 py-1 text-xs font-medium transition-all',
          awaitingDelete
            ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
            : 'text-muted-foreground/40 hover:text-destructive'
        )}
        title={awaitingDelete ? 'Click again to confirm' : 'Delete entry'}
      >
        {awaitingDelete ? 'Delete?' : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Body() {
  const [rows,      setRows]      = useState<BodyMetricRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await invoke<BodyMetricRow[]>(IPC.BODY_LIST, 90)
      setRows(data)
      setLoadError(null)
    } catch {
      setLoadError('Could not load body metrics. Please restart the app.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Optimistic delete with rollback
  const handleDelete = async (id: number) => {
    const backup = rows
    setRows(prev => prev.filter(r => r.id !== id))
    try {
      await invoke(IPC.BODY_DELETE, id)
    } catch {
      setRows(backup)
    }
  }

  // Derived data ──────────────────────────────────────────────────────────────

  const existingDates = new Set(rows.map(r => r.date))

  // Chart: ascending order, weight entries only, skip null/NaN
  const chartData = [...rows]
    .filter(r => r.weightKg != null && Number.isFinite(r.weightKg))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ date: r.date.slice(5), weight: r.weightKg as number }))

  // Latest & previous entries that have the relevant field (for stats cards)
  const latestWeight   = rows.find(r => r.weightKg   != null)
  const previousWeight = rows.find(r => r.id !== latestWeight?.id && r.weightKg   != null)
  const latestFat      = rows.find(r => r.bodyFatPct != null)
  const previousFat    = rows.find(r => r.id !== latestFat?.id   && r.bodyFatPct  != null)

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2.5 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Body</h1>
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8 max-w-2xl">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Body</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Track your physical transformation over time.
        </p>
      </div>

      {/* ── Log form — always at top so it's always reachable ──── */}
      <LogForm existingDates={existingDates} onSaved={load} />

      {/* ── Current stats ──────────────────────────────────────── */}
      {(latestWeight || latestFat) && (
        <div className="grid grid-cols-2 gap-4">
          {latestWeight && (
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Weight
              </p>
              <p className="text-3xl font-bold mt-1.5 tabular-nums">
                {latestWeight.weightKg!.toFixed(1)}{' '}
                <span className="text-base font-normal text-muted-foreground">kg</span>
              </p>
              {previousWeight?.weightKg != null && (
                <div className="mt-1.5">
                  <Trend
                    current={latestWeight.weightKg!}
                    previous={previousWeight.weightKg}
                    unit="kg"
                    goodDirection="down"
                  />
                </div>
              )}
            </div>
          )}
          {latestFat && (
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Body Fat
              </p>
              <p className="text-3xl font-bold mt-1.5 tabular-nums">
                {latestFat.bodyFatPct!.toFixed(1)}{' '}
                <span className="text-base font-normal text-muted-foreground">%</span>
              </p>
              {previousFat?.bodyFatPct != null && (
                <div className="mt-1.5">
                  <Trend
                    current={latestFat.bodyFatPct!}
                    previous={previousFat.bodyFatPct}
                    unit="%"
                    goodDirection="down"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Weight chart (needs ≥2 data points) ────────────────── */}
      {chartData.length >= 2 && (
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Weight trend
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                domain={['dataMin - 1', 'dataMax + 1']}
                tickFormatter={v => `${v}kg`}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: unknown) => [
                  typeof v === 'number' ? `${v.toFixed(1)} kg` : '—',
                  'Weight',
                ]}
              />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── History ────────────────────────────────────────────── */}
      {rows.length > 0 ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              History
            </p>
          </div>
          <div className="divide-y divide-border/60">
            {rows.map(r => (
              <HistoryRow key={r.id} row={r} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
          <p className="text-4xl">⚖️</p>
          <p className="font-semibold">No entries yet</p>
          <p className="text-sm text-muted-foreground">
            Log your first measurement above to start tracking your transformation.
          </p>
        </div>
      )}
    </div>
  )
}
