import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Zap, CalendarDays, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/contexts/ToastContext'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { PlanRow } from '@/types/ipc'
import { planEndDate } from '@/shared/planCalendar'
import { fmtDate } from './sessionFormat'

interface Props {
  plan: PlanRow
  onRefresh: () => void
  onActivateRequest: (plan: PlanRow) => void
}

export function PlanCard({ plan, onRefresh, onActivateRequest }: Props) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`„${plan.name}“ löschen? Das kann nicht rückgängig gemacht werden.`)) return
    setDeleting(true)
    try {
      await invoke(IPC.PLANS_DELETE, plan.id)
      onRefresh()
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Löschen fehlgeschlagen', duration: 6000 })
      setDeleting(false)
    }
  }

  return (
    <div
      className={`rounded-lg border bg-card p-4 vspace-3 transition-colors ${plan.isActive ? 'border-primary ring-1 ring-primary' : ''}`}
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
              <Badge className="text-xs">Aktiv</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Archiv</Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1 tabular-nums">
              <CalendarDays className="h-3.5 w-3.5" />
              {fmtDate(plan.startDate)} – {fmtDate(planEndDate(plan.startDate, plan.weekCount))}
              {' · '}{plan.weekCount} {plan.weekCount === 1 ? 'Woche' : 'Wochen'}
            </span>
            {plan.goalEvent && (
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" />{plan.goalEvent}
              </span>
            )}
            {plan.goalDate && (
              <span className="flex items-center gap-1 tabular-nums">
                <Flag className="h-3.5 w-3.5" />{fmtDate(plan.goalDate)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button variant="outline" size="sm" onClick={() => navigate(`/plan/${plan.id}`)} disabled={deleting}>
            Öffnen
          </Button>
          {!plan.isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onActivateRequest(plan)}
              disabled={deleting}
            >
              Aktivieren
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="px-2 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting}
            title="Plan löschen"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
