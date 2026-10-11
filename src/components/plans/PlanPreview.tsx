import { planStats, type ParsedPlan } from '@/lib/planImport'
import { fmtDate, sessionTargetText, TYPE_LABEL, DOW_SHORT } from './sessionFormat'

export function PlanPreview({ plan }: { plan: ParsedPlan }) {
  const { totalWeeks, totalSessions } = planStats(plan)

  return (
    <div className="rounded-lg border bg-muted/30 p-4 vspace-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-base">{plan.name}</p>
          {plan.goalEvent && <p className="text-muted-foreground">{plan.goalEvent}</p>}
          {plan.goalDate && <p className="text-muted-foreground">Zieldatum: {fmtDate(plan.goalDate)}</p>}
        </div>
        <div className="text-right text-muted-foreground shrink-0">
          <p>{totalWeeks} {totalWeeks === 1 ? 'Woche' : 'Wochen'}</p>
          <p>{totalSessions} {totalSessions === 1 ? 'Einheit' : 'Einheiten'}</p>
        </div>
      </div>

      <div className="vspace-2 max-h-72 overflow-y-auto pr-1">
        {plan.weeks.map((week, i) => (
          <div key={i} className="border rounded-[0.25rem] p-3 vspace-1.5 bg-background">
            <div className="flex items-center justify-between">
              <span className="font-medium">Woche {i + 1}{week.phase ? ` · ${week.phase}` : ''}</span>
              <span className="text-xs text-muted-foreground">
                {week.sessions.length} {week.sessions.length === 1 ? 'Einheit' : 'Einheiten'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {week.sessions.map((s, si) => {
                const target = sessionTargetText({
                  targetDistanceKm: s.targetDistanceKm ?? null,
                  targetDurationMin: s.targetDurationMin ?? null,
                  targetPaceFastSec: s.targetPaceFastSec ?? null,
                  targetPaceSlowSec: s.targetPaceSlowSec ?? null,
                  targetHrZone: s.targetHrZone ?? null,
                })
                return (
                  <span
                    key={si}
                    className="inline-flex items-center gap-1 rounded-[0.25rem] border px-2 py-0.5 text-xs bg-muted"
                  >
                    <span className="font-medium">{DOW_SHORT[s.dayOfWeek - 1]}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{s.title || TYPE_LABEL[s.type]}</span>
                    {target && <span className="text-muted-foreground">{target}</span>}
                  </span>
                )
              })}
              {week.sessions.length === 0 && (
                <span className="text-xs text-muted-foreground italic">Keine Einheiten</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
