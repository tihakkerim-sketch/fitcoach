import { Link } from 'react-router-dom'
import { Brain, AlertTriangle, Info } from 'lucide-react'
import { FORM_TEXT } from '@/shared/coach'
import { useCoachStatus } from '@/hooks/useCoachStatus'
import { FORM_COLOR } from '@/components/coach/formStyle'
import { cn } from '@/lib/utils'

/** Kleine Coach-Karte fürs Dashboard: Form + erste Warnung. Bei Fehler/ohne Daten unsichtbar. */
export function CoachCard() {
  const { status, error } = useCoachStatus()
  if (error || !status || !status.current || !status.form) return null
  const tsb = Math.round(status.current.tsb)
  const w = status.ramp.warnings[0]
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-4 flex-wrap">
      <Brain className="h-5 w-5 text-blue-500 shrink-0" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Form</p>
        <p className="text-lg font-bold">
          <span className={FORM_COLOR[status.form]}>{tsb > 0 ? '+' : ''}{tsb}</span>{' '}
          <span className="text-sm font-medium text-muted-foreground">{FORM_TEXT[status.form]}</span>
        </p>
      </div>
      {w && (
        <p className="flex-1 min-w-[200px] text-sm flex gap-2 items-start">
          {w.level === 'warn'
            ? <AlertTriangle className={cn('h-4 w-4 shrink-0 mt-0.5 text-red-500')} />
            : <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />}
          {w.text}
        </p>
      )}
      <Link to="/coach" className="ml-auto text-sm text-primary underline">Zum Coach</Link>
    </div>
  )
}
