import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Zap, CalendarDays } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { PlanRow } from '@/types/ipc'

interface Props {
  plan: PlanRow
  onRefresh: () => void
  onActivateRequest: (plan: PlanRow) => void
}

export function PlanCard({ plan, onRefresh, onActivateRequest }: Props) {
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Delete "${plan.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await invoke(IPC.PLANS_DELETE, plan.id)
      onRefresh()
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div
      className={`rounded-lg border bg-card p-4 space-y-3 transition-colors ${plan.isActive ? 'border-primary ring-1 ring-primary' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className="font-semibold cursor-pointer hover:underline"
              onClick={() => navigate(`/plan/${plan.id}`)}
            >
              {plan.name}
            </h3>
            {plan.isActive ? (
              <Badge className="text-xs">Active</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Inactive</Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
            {plan.goalEvent && (
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" />{plan.goalEvent}
              </span>
            )}
            {plan.goalDate && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {format(new Date(plan.goalDate), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!plan.isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onActivateRequest(plan)}
              disabled={deleting}
            >
              Set Active
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="px-2 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground -ml-2 h-7"
        onClick={() => navigate(`/plan/${plan.id}`)}
      >
        View plan →
      </Button>
    </div>
  )
}
