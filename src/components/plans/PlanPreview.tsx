import { planStats, type ClaudePlan } from '@/lib/planImport'

export function PlanPreview({ plan }: { plan: ClaudePlan }) {
  const { totalWeeks, totalSessions } = planStats(plan)

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-base">{plan.name}</p>
          {plan.goalEvent && <p className="text-muted-foreground">{plan.goalEvent}</p>}
          {plan.goalDate  && <p className="text-muted-foreground">Goal date: {plan.goalDate}</p>}
        </div>
        <div className="text-right text-muted-foreground shrink-0">
          <p>{totalWeeks} weeks</p>
          <p>{totalSessions} sessions total</p>
        </div>
      </div>

      <div className="space-y-2">
        {plan.phases.map((phase, i) => (
          <div key={i} className="border rounded p-3 space-y-1.5 bg-background">
            <div className="flex items-center justify-between">
              <span className="font-medium">{phase.name}</span>
              <span className="text-xs text-muted-foreground">{phase.weeks} week{phase.weeks !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {phase.sessions.map((s, si) => (
                <span
                  key={si}
                  className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs bg-muted"
                >
                  <span className="font-medium">{s.day}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="capitalize">{s.type}</span>
                  {s.durationMin && <span className="text-muted-foreground">{s.durationMin}m</span>}
                  {s.hrZone      && <span className="text-muted-foreground">Z{s.hrZone}</span>}
                </span>
              ))}
              {phase.sessions.length === 0 && (
                <span className="text-xs text-muted-foreground italic">No sessions</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
