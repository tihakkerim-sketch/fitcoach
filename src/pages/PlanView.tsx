import { useState } from 'react'
import { Plus, FileJson, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlanCard } from '@/components/plans/PlanCard'
import { EmptyPlanModal } from '@/components/plans/EmptyPlanModal'
import { ImportPlanModal } from '@/components/plans/ImportPlanModal'
import { AdaptPlanModal } from '@/components/plans/AdaptPlanModal'
import { ProposalCards } from '@/components/adapt/ProposalCard'
import { usePlans } from '@/hooks/usePlans'
import { useToast } from '@/contexts/ToastContext'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { PlanRow } from '@/types/ipc'

export default function PlanView() {
  const { plans, loading, error, refresh } = usePlans()
  const { toast } = useToast()
  const [emptyOpen,         setEmptyOpen]         = useState(false)
  const [importOpen,        setImportOpen]        = useState(false)
  const [adaptTarget,       setAdaptTarget]       = useState<PlanRow | null>(null)
  const [activateCandidate, setActivateCandidate] = useState<PlanRow | null>(null)
  const [activating,        setActivating]        = useState(false)

  const currentActive = plans.find(p => p.isActive)

  const confirmActivate = async () => {
    if (!activateCandidate) return
    setActivating(true)
    try {
      await invoke(IPC.PLANS_ACTIVATE, activateCandidate.id)
      refresh()
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Aktivieren fehlgeschlagen', duration: 6000 })
    } finally {
      setActivating(false)
      setActivateCandidate(null)
    }
  }

  return (
    <div className="p-6 vspace-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Trainingspläne</h1>
          <p className="text-sm text-muted-foreground">
            {plans.length} {plans.length === 1 ? 'Plan' : 'Pläne'}
            {currentActive ? ` · Aktiv: ${currentActive.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {currentActive && (
            <Button variant="outline" onClick={() => setAdaptTarget(currentActive)}>
              <GitBranch className="h-4 w-4 mr-2" />
              Aktiven Plan mit Claude anpassen
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileJson className="h-4 w-4 mr-2" />
            Plan aus Claude importieren
          </Button>
          <Button onClick={() => setEmptyOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Leerer Plan
          </Button>
        </div>
      </div>

      <ProposalCards />

      {loading && plans.length === 0 && (
        <div className="text-muted-foreground text-sm">Wird geladen …</div>
      )}
      {error && (
        <div className="text-destructive text-sm">{error}</div>
      )}

      {!loading && !error && plans.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <p>Noch kein Trainingsplan vorhanden.</p>
          <p className="text-sm">Lass Claude einen Plan als JSON schreiben und importiere ihn, oder lege selbst einen leeren Plan an.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileJson className="h-4 w-4 mr-2" />
              Plan aus Claude importieren
            </Button>
            <Button variant="outline" onClick={() => setEmptyOpen(true)}>
              Leerer Plan
            </Button>
          </div>
        </div>
      )}

      <div className="vspace-3">
        {plans.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onRefresh={refresh}
            onActivateRequest={setActivateCandidate}
          />
        ))}
      </div>

      <EmptyPlanModal
        open={emptyOpen}
        onClose={() => setEmptyOpen(false)}
        onSaved={refresh}
      />

      <ImportPlanModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSaved={refresh}
      />

      {adaptTarget && (
        <AdaptPlanModal
          open={!!adaptTarget}
          onClose={() => setAdaptTarget(null)}
          onSaved={refresh}
          planId={adaptTarget.id}
          planName={adaptTarget.name}
        />
      )}

      <Dialog open={!!activateCandidate} onOpenChange={v => { if (!v) setActivateCandidate(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Aktiven Plan wechseln?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {currentActive
              ? `„${currentActive.name}“ ist aktuell aktiv und wird durch „${activateCandidate?.name}“ ersetzt.`
              : `„${activateCandidate?.name}“ wird der aktive Plan.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateCandidate(null)} disabled={activating}>
              Abbrechen
            </Button>
            <Button onClick={confirmActivate} disabled={activating}>
              {activating ? 'Wird gewechselt …' : 'Bestätigen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
