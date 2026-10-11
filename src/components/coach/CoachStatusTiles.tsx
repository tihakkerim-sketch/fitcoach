import type { CoachStatus } from '@/shared/coach'
import { FORM_TEXT } from '@/shared/coach'
import { cn } from '@/lib/utils'
import { FORM_COLOR } from './formStyle'

function Tile({ label, value, hint, valueClass }: { label: string; value: string; hint: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-3xl font-bold mt-1', valueClass)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  )
}

export function CoachStatusTiles({ status }: { status: CoachStatus }) {
  const c = status.current
  if (!c) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Noch keine Trainingsdaten für die Belastungsrechnung.
      </div>
    )
  }
  const tsb = Math.round(c.tsb)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Tile label="Fitness (CTL)" value={String(Math.round(c.ctl))} hint="Langzeit-Belastung, 6 Wochen" />
      <Tile label="Ermüdung (ATL)" value={String(Math.round(c.atl))} hint="Kurzzeit-Belastung, 7 Tage" />
      <Tile
        label="Form (TSB)"
        value={`${tsb > 0 ? '+' : ''}${tsb}`}
        hint={`Fitness minus Ermüdung · ${status.form ? FORM_TEXT[status.form] : ''}`}
        valueClass={status.form ? FORM_COLOR[status.form] : undefined}
      />
    </div>
  )
}
