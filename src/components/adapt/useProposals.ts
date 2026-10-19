import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { PlanDetail } from '@/types/ipc'
import type { ProposalView } from '@/shared/adapt/views'
import { emitDataChanged, onDataChanged } from '@/lib/dataEvents'

/** Offene Plan-Vorschläge + aktiver Plan (für vorher → nachher). */
export function useProposals() {
  const [proposals, setProposals] = useState<ProposalView[]>([])
  const [plan, setPlan] = useState<PlanDetail | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await invoke(IPC.ADAPT_PROPOSALS)
      setProposals(list)
      if (list.length === 0) { setPlan(null); return }
      const active = (await invoke(IPC.PLANS_LIST)).find(p => p.isActive)
      setPlan(active ? await invoke(IPC.PLANS_GET, active.id) : null)
    } catch {
      setProposals([])
    }
  }, [])

  useEffect(() => { void load(); return onDataChanged(() => { void load() }) }, [load])

  const apply = useCallback(async (id: number): Promise<'applied' | 'stale'> => {
    const { status } = await invoke(IPC.ADAPT_APPLY, { id })
    emitDataChanged()
    return status
  }, [])

  const reject = useCallback(async (id: number) => {
    await invoke(IPC.ADAPT_REJECT, { id })
    emitDataChanged()
  }, [])

  return { proposals, plan, apply, reject }
}
