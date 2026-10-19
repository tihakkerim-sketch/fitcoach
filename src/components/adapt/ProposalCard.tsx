import { useState } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/contexts/ToastContext'
import { sessionSummary } from '@/lib/coachChanges'
import type { PlanDetail, SessionRow } from '@/types/ipc'
import type { CoachChange } from '@/shared/adapt/types'
import type { ProposalKind, ProposalView } from '@/shared/adapt/views'
import { useProposals } from './useProposals'

const TITLE: Record<ProposalKind, string> = {
  run: 'Plan-Vorschlag',
  pace: 'Tempo-Ziele anpassen',
  not_full: 'Nicht 100 %',
}

const dayLabel = (date: string) => format(new Date(`${date}T12:00:00`), 'EEEEEE, d.M.', { locale: de })

function describe(c: CoachChange, plan: PlanDetail | null): { label: string; before: string; after: string } {
  const sessions: SessionRow[] = plan ? plan.weeks.flatMap(w => w.sessions) : []
  if (c.action === 'add') return { label: dayLabel(c.date), before: '—', after: sessionSummary(c.session) }
  const s = sessions.find(x => x.id === c.sessionId)
  const label = s ? `${dayLabel(s.date)}${s.title ? ` · ${s.title}` : ''}` : `Einheit #${c.sessionId}`
  if (!s) return { label, before: '?', after: '?' }
  if (c.action === 'move') return { label, before: dayLabel(s.date), after: dayLabel(c.date) }
  if (c.action === 'remove') return { label, before: sessionSummary(s), after: 'entfernt' }
  return { label, before: sessionSummary(s), after: sessionSummary({ ...s, ...c.set } as SessionRow) }
}

function Card({ p, plan, onApply, onReject }: {
  p: ProposalView
  plan: PlanDetail | null
  onApply: () => Promise<void>
  onReject: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(p.changes.length <= 5)
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }
  const reasons = p.reasons.filter((r, i, all) => all.findIndex(x => x.text === r.text) === i)

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 vspace-3" data-testid="proposal-card">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="font-semibold">{TITLE[p.kind]}</p>
        <span className="text-xs text-muted-foreground">
          {p.changes.length} {p.changes.length === 1 ? 'Änderung' : 'Änderungen'}
        </span>
      </div>
      <ul className="text-sm vspace-1 list-disc pl-5">
        {reasons.map((r, i) => <li key={i}>{r.text}</li>)}
      </ul>
      {open ? (
        <ul className="text-xs vspace-1">
          {p.changes.map((c, i) => {
            const d = describe(c, plan)
            return (
              <li key={i} className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{d.label}:</span>
                <span className="text-muted-foreground line-through">{d.before}</span>
                <ArrowRight className="h-3 w-3" />
                <span>{d.after}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <button className="text-xs underline text-muted-foreground" onClick={() => setOpen(true)}>Alle Änderungen zeigen</button>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={run(onApply)}>Übernehmen</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={run(onReject)}>Ablehnen</Button>
      </div>
    </div>
  )
}

/** Alle offenen Vorschläge als Karten (Dashboard + Plan-Seite). */
export function ProposalCards() {
  const { proposals, plan, apply, reject } = useProposals()
  const { toast } = useToast()
  if (proposals.length === 0) return null
  return (
    <div className="vspace-3">
      {proposals.map(p => (
        <Card
          key={p.id}
          p={p}
          plan={plan}
          onApply={async () => {
            try {
              const status = await apply(p.id)
              toast({
                message: status === 'applied' ? 'Plan angepasst.' : 'Plan hat sich geändert – Vorschlag verworfen.',
                duration: 4000,
              })
            } catch (e) {
              toast({ message: e instanceof Error ? e.message : 'Übernehmen fehlgeschlagen.', duration: 5000 })
            }
          }}
          onReject={async () => {
            await reject(p.id)
            toast({ message: 'Vorschlag abgelehnt.', duration: 3000 })
          }}
        />
      ))}
    </div>
  )
}
