import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import type { Prognosis, PrognosisStatus } from '@/shared/coach'
import { formatDuration } from '@/shared/coach'
import { formatPace } from '@/shared/planCalendar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS: Record<Exclude<PrognosisStatus, 'noGoal'>, { text: string; cls: string }> = {
  onTrack: { text: 'Auf Kurs', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  close: { text: 'Knapp', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  offTrack: { text: 'Nicht auf Kurs', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
}

export function PrognosisCard({ prognosis: p }: { prognosis: Prognosis | null }) {
  if (!p) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Noch keine Läufe ≥ 5 km in den letzten 12 Wochen.
      </div>
    )
  }
  const b = p.basedOn
  return (
    <div className="rounded-lg border bg-card p-4 vspace-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{p.targetLabel}</p>
          <p className="text-3xl font-bold mt-1">{formatDuration(p.predictedSec)}</p>
          <p className="text-sm text-muted-foreground">{formatPace(p.predictedPaceSec)}/km</p>
        </div>
        <div className="text-right text-sm">
          {p.status === 'noGoal' ? (
            <p className="text-muted-foreground">
              Kein Ziel gesetzt – <Link to="/settings" className="underline text-primary">Einstellungen</Link>
            </p>
          ) : (
            <>
              <Badge className={cn('border-transparent', STATUS[p.status].cls)}>{STATUS[p.status].text}</Badge>
              {p.goalSec != null && <p className="mt-1">Zielzeit {formatDuration(p.goalSec)}</p>}
              {p.requiredPaceSec != null && (
                <p className="text-xs text-muted-foreground">nötige Pace {formatPace(p.requiredPaceSec)}/km</p>
              )}
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Basiert auf dem Lauf vom {format(new Date(`${b.date}T12:00:00`), 'dd.MM.yyyy')}: {b.distanceKm.toLocaleString('de-AT', { maximumFractionDigits: 1 })} km in {formatDuration(b.durationSec)}.
        Schätzung aus Trainingsläufen (Riegel-Formel) – Wettkampfform ist meist schneller.
      </p>
    </div>
  )
}
