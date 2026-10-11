import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { ActivitySplit, ActivityStreams } from '@/types/ipc'

interface Props {
  activityId: number
}

type Details = { splits: ActivitySplit[]; streams: ActivityStreams | null }

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'hsl(var(--popover))',
  borderColor: 'hsl(var(--border))',
  borderRadius: '10px',
  fontSize: 12,
  color: 'hsl(var(--popover-foreground))',
  boxShadow: '0 8px 24px -4px rgba(0,0,0,0.15)',
}

// ── Formatierung ──────────────────────────────────────────────────────────────

const de1 = (n: number, digits = 1) => n.toFixed(digits).replace('.', ',')

function fmtTime(sec: number): string {
  const total = Math.round(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function fmtPace(secPerKm?: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '–'
  const total = Math.round(secPerKm)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// ── Diagramm ──────────────────────────────────────────────────────────────────

interface Point { x: number; y: number | null }

function MiniChart({
  title, data, color, xLabel, formatY, reversed = false, unit,
}: {
  title: string
  data: Point[]
  color: string
  xLabel: string
  formatY: (v: number) => string
  reversed?: boolean
  unit: string
}) {
  if (!data.some(p => p.y != null)) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">{title}</p>
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="x" type="number" domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
            tickFormatter={(v: number) => de1(v, xLabel === 'km' ? 1 : 0)}
          />
          <YAxis
            width={40} reversed={reversed} domain={['auto', 'auto']}
            tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
            tickFormatter={formatY}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(v) => `${de1(Number(v), xLabel === 'km' ? 2 : 0)} ${xLabel}`}
            formatter={(v) => [`${formatY(Number(v))} ${unit}`.trim(), title]}
          />
          <Line type="monotone" dataKey="y" stroke={color} strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Splits-Tabelle ────────────────────────────────────────────────────────────

function SplitsTable({ splits }: { splits: ActivitySplit[] }) {
  const hasHr = splits.some(s => s.avgHr != null)
  const hasElev = splits.some(s => s.elevationGainM != null || s.elevationLossM != null)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="py-1 pr-3 font-medium">km</th>
            <th className="py-1 pr-3 font-medium">Zeit</th>
            <th className="py-1 pr-3 font-medium">Pace /km</th>
            {hasHr && <th className="py-1 pr-3 font-medium">Ø Puls</th>}
            {hasElev && <th className="py-1 font-medium">Höhe</th>}
          </tr>
        </thead>
        <tbody>
          {splits.map(s => {
            const partial = s.distanceKm < 0.995
            return (
              <tr key={s.splitIndex} className="border-b border-border/50 last:border-0">
                <td className="py-1 pr-3">
                  {partial ? `${de1(s.distanceKm, 2)} km` : s.splitIndex}
                </td>
                <td className="py-1 pr-3">{fmtTime(s.durationSec)}</td>
                <td className="py-1 pr-3">{fmtPace(s.paceSecPerKm)}</td>
                {hasHr && <td className="py-1 pr-3">{s.avgHr != null ? Math.round(s.avgHr) : '–'}</td>}
                {hasElev && (
                  <td className="py-1">
                    {s.elevationGainM == null && s.elevationLossM == null
                      ? '–'
                      : `${s.elevationGainM != null ? `↑${Math.round(s.elevationGainM)}` : ''} ${s.elevationLossM != null ? `↓${Math.round(s.elevationLossM)}` : ''} m`}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Komponente ────────────────────────────────────────────────────────────────

export function ActivityDetails({ activityId }: Props) {
  const [details, setDetails] = useState<Details | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    invoke(IPC.ACTIVITIES_DETAILS, activityId)
      .then(d => { if (!cancelled) setDetails(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Details konnten nicht geladen werden.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activityId])

  const series = useMemo(() => {
    const st = details?.streams
    if (!st) return null
    const useDist = st.distKm.some(d => d != null)
    const xs = useDist ? st.distKm : st.t.map(t => t / 60)
    const build = (arr: (number | null)[]): Point[] =>
      arr.flatMap((y, i) => (xs[i] == null ? [] : [{ x: xs[i] as number, y }]))
    return {
      xLabel: useDist ? 'km' : 'min',
      hr: build(st.hr),
      // unrealistische Pace-Ausreißer (Stehen, GPS-Sprung) ausblenden
      pace: build(st.paceSec.map(p => (p != null && p > 0 && p < 1200 ? p : null))),
      alt: build(st.altM),
    }
  }, [details])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Details werden geladen …
      </div>
    )
  }
  if (error) return <p className="text-xs text-destructive">{error}</p>

  const hasSplits = (details?.splits.length ?? 0) > 0
  if (!details || (!hasSplits && !series)) {
    return (
      <p className="text-xs text-muted-foreground">
        Keine Detaildaten (manuell erfasst oder alter Import).
      </p>
    )
  }

  return (
    <div className="vspace-4">
      {hasSplits && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Splits</p>
          <SplitsTable splits={details.splits} />
        </div>
      )}
      {series && (
        <div className="grid gap-4 md:grid-cols-3">
          <MiniChart title="Puls" data={series.hr} color="#f43f5e" xLabel={series.xLabel}
            formatY={v => String(Math.round(v))} unit="bpm" />
          <MiniChart title="Pace" data={series.pace} color="#3b82f6" xLabel={series.xLabel}
            formatY={fmtPace} unit="/km" reversed />
          <MiniChart title="Höhe" data={series.alt} color="#10b981" xLabel={series.xLabel}
            formatY={v => String(Math.round(v))} unit="m" />
        </div>
      )}
    </div>
  )
}
