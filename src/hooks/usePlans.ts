import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { PlanRow } from '@/types/ipc'

export function usePlans() {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await invoke<PlanRow[]>(IPC.PLANS_LIST)
      setPlans(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plans')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { plans, loading, error, refresh: load }
}
