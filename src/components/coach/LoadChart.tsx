import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import type { LoadPoint } from '@/shared/coach'
import { tooltipStyle } from './formStyle'

const NAMES: Record<string, string> = { ctl: 'Fitness', atl: 'Ermüdung', tsb: 'Form' }

export function LoadChart({ series }: { series: LoadPoint[] }) {
  if (series.length < 2) return null
  const data = series.map(p => ({
    date: p.date,
    ctl: Math.round(p.ctl * 10) / 10,
    atl: Math.round(p.atl * 10) / 10,
    tsb: Math.round(p.tsb * 10) / 10,
  }))
  const label = (d: string) => format(new Date(`${d}T12:00:00`), 'dd.MM.')
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-medium mb-2">Belastung der letzten 90 Tage</p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tickFormatter={label} tick={{ fontSize: 11 }} minTickGap={30} />
          <YAxis tick={{ fontSize: 11 }} width={32} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(d) => label(String(d))}
            formatter={(v, n) => [String(v), NAMES[String(n)] ?? String(n)]}
          />
          <Legend formatter={(v) => NAMES[String(v)] ?? String(v)} />
          <Area type="monotone" dataKey="tsb" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.12} dot={false} />
          <Line type="monotone" dataKey="ctl" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="atl" stroke="#ef4444" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
