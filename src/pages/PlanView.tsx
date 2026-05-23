import { useState } from 'react'
import { Plus, FileJson, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlanCard } from '@/components/plans/PlanCard'
import { CreatePlanModal } from '@/components/plans/CreatePlanModal'
import { ImportPlanModal } from '@/components/plans/ImportPlanModal'
import { AdaptPlanModal } from '@/components/plans/AdaptPlanModal'
import { usePlans } from '@/hooks/usePlans'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { PlanRow } from '@/types/ipc'

export default function PlanView() {
  const { plans, loading, error, refresh } = usePlans()
  const [createOpen,        setCreateOpen]        = useState(false)
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
    } finally {
      setActivating(false)
      setActivateCandidate(null)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Training Plans</h1>
          <p className="text-sm text-muted-foreground">
            {plans.length} plan{plans.length !== 1 ? 's' : ''}
            {currentActive ? ` · Active: ${currentActive.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentActive && (
            <Button variant="outline" onClick={() => setAdaptTarget(currentActive)}>
              <GitBranch className="h-4 w-4 mr-2" />
              Adapt Active Plan
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileJson className="h-4 w-4 mr-2" />
            Import from Claude
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Plan
          </Button>
        </div>
      </div>

      {loading && (
        <div className="text-muted-foreground text-sm">Loading…</div>
      )}
      {error && (
        <div className="text-destructive text-sm">{error}</div>
      )}

      {!loading && plans.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <p>No training plans yet.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileJson className="h-4 w-4 mr-2" />
              Import from Claude
            </Button>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              Create manually
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {plans.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onRefresh={refresh}
            onActivateRequest={setActivateCandidate}
          />
        ))}
      </div>

      <CreatePlanModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
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
          onSaved={() => { setAdaptTarget(null); refresh() }}
          planId={adaptTarget.id}
          planName={adaptTarget.name}
        />
      )}

      {/* Activate confirmation dialog */}
      <Dialog open={!!activateCandidate} onOpenChange={v => { if (!v) setActivateCandidate(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Switch active plan?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {currentActive
              ? `"${currentActive.name}" is currently active. It will be deactivated and replaced by "${activateCandidate?.name}".`
              : `"${activateCandidate?.name}" will become the active plan.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateCandidate(null)} disabled={activating}>
              Cancel
            </Button>
            <Button onClick={confirmActivate} disabled={activating}>
              {activating ? 'Switching…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
