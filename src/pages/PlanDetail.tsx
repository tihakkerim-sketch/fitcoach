import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Zap, GitBranch } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WeekGrid } from '@/components/plans/WeekGrid'
import { AdaptPlanModal } from '@/components/plans/AdaptPlanModal'
import { usePlanDetail } from '@/hooks/usePlanDetail'

export default function PlanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const planId = id ? parseInt(id, 10) : null
  const { plan, loading, error, refresh } = usePlanDetail(planId)
  const [adaptOpen, setAdaptOpen] = useState(false)

  if (loading) {
    return (
      <div className="p-6 text-muted-foreground">Loading…</div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-destructive">{error}</div>
    )
  }

  if (!plan) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-muted-foreground">Plan not found.</p>
        <Button variant="outline" onClick={() => navigate('/plan')}>← Back to plans</Button>
      </div>
    )
  }

  const totalWeeks = plan.phases.reduce((sum, p) => sum + p.durationWeeks, 0)
  const totalSessions = plan.phases.flatMap(p => p.weeks.flatMap(w => w.sessions))
  const completed = totalSessions.filter(s => s.status === 'completed').length
  const skipped   = totalSessions.filter(s => s.status === 'skipped').length
  const decided   = completed + skipped   // sessions that have been acted on
  const adherencePct = decided > 0 ? Math.round((completed / decided) * 100) : null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-4 space-y-2">
        <Button variant="ghost" size="sm" className="mb-1 -ml-2 text-muted-foreground" onClick={() => navigate('/plan')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> All plans
        </Button>

        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold">{plan.name}</h1>
          {plan.isActive ? (
            <Badge>Active</Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          )}
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdaptOpen(true)}
              className="gap-1.5"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Adapt Plan
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {plan.goalEvent && (
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" />{plan.goalEvent}</span>
          )}
          {plan.goalDate && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {format(new Date(plan.goalDate), 'MMM d, yyyy')}
            </span>
          )}
          <span className="tabular-nums">{totalWeeks} wks · {totalSessions.length} sessions</span>
          {totalSessions.length > 0 && (
            <span className="tabular-nums">
              <span className="text-green-600 dark:text-green-400">{completed} done</span>
              {skipped > 0 && <span className="text-muted-foreground"> · {skipped} skipped</span>}
            </span>
          )}
        </div>

        {/* Adherence bar */}
        {adherencePct !== null && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Adherence
              </p>
              <span
                className="text-sm font-bold tabular-nums"
                style={{
                  color: adherencePct >= 80
                    ? '#22c55e'
                    : adherencePct >= 50
                      ? '#f59e0b'
                      : '#ef4444',
                }}
              >
                {adherencePct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${adherencePct}%`,
                  background: adherencePct >= 80
                    ? '#22c55e'
                    : adherencePct >= 50
                      ? '#f59e0b'
                      : '#ef4444',
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {completed} of {decided} acted-on sessions completed
            </p>
          </div>
        )}
      </div>

      {/* Calendar grid */}
      <ScrollArea className="flex-1">
        <div className="px-6 py-4">
          {plan.phases.length === 0 ? (
            <p className="text-muted-foreground text-sm">This plan has no phases.</p>
          ) : (
            <WeekGrid phases={plan.phases} onSessionUpdated={refresh} />
          )}
        </div>
      </ScrollArea>

      {/* Adapt modal */}
      {planId && (
        <AdaptPlanModal
          open={adaptOpen}
          onClose={() => setAdaptOpen(false)}
          onSaved={() => { setAdaptOpen(false); refresh() }}
          planId={planId}
          planName={plan.name}
        />
      )}
    </div>
  )
}
