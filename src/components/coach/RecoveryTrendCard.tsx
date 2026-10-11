import type { RecoveryTrend } from '@/shared/coach'

const f = (v: number | null, d = 0) => (v == null ? '–' : v.toFixed(d))

export function RecoveryTrendCard({ r }: { r: RecoveryTrend }) {
  const d = r.hrvDeltaPct
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="rounded-lg border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">HRV</p>
        <p className="text-lg font-bold">{f(r.hrvToday)} ms</p>
        <p className="text-xs text-muted-foreground">
          heute vs. 30-Tage-Schnitt {f(r.hrv30)}
          {d != null && ` (${d > 0 ? '+' : ''}${Math.round(d)} %)`}
        </p>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ruhepuls</p>
        <p className="text-lg font-bold">{f(r.rhr7)} bpm</p>
        <p className="text-xs text-muted-foreground">7 Tage · 30 Tage: {f(r.rhr30)}</p>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schlaf</p>
        <p className="text-lg font-bold">{f(r.sleep7, 1)} h</p>
        <p className="text-xs text-muted-foreground">7 Tage · 30 Tage: {f(r.sleep30, 1)} h</p>
      </div>
    </div>
  )
}
