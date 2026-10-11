import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import type { RampInfo } from '@/shared/coach'
import { cn } from '@/lib/utils'

export function WarningsCard({ ramp }: { ramp: RampInfo }) {
  const summary = `Letzte 7 Tage: ${ramp.last7Km.toLocaleString('de-AT', { maximumFractionDigits: 1 })} km · Schnitt der 4 Wochen davor: ${ramp.avgWeekKmPrev28.toLocaleString('de-AT', { maximumFractionDigits: 1 })} km pro Woche`
  if (ramp.warnings.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Keine zu schnelle Steigerung</p>
          <p className="text-xs text-muted-foreground mt-0.5">{summary}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="vspace-2">
      {ramp.warnings.map((w, i) => {
        const warn = w.level === 'warn'
        const Icon = warn ? AlertTriangle : Info
        return (
          <div key={i} className={cn('rounded-lg border p-3 flex gap-3', warn ? 'border-red-500/30 bg-red-500/5' : 'border-blue-500/30 bg-blue-500/5')}>
            <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', warn ? 'text-red-500' : 'text-blue-500')} />
            <p className="text-sm">{w.text}</p>
          </div>
        )
      })}
      <p className="text-xs text-muted-foreground">{summary}</p>
    </div>
  )
}
