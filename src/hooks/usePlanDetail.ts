import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { PlanDetail } from '@/types/ipc'

export function usePlanDetail(id: number | null) {
  const [plan, setPlan] = useState<PlanDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (id == null) return
    setLoading(true)
    setError(null)
    try {
      const data = await invoke<PlanDetail | null>(IPC.PLANS_GET, id)
      setPlan(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plan')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  return { plan, loading, error, refresh: load }
}
