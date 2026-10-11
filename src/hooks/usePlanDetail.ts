import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { PlanDetail } from '@/types/ipc'

/**
 * Lädt einen Plan. `loading` ist nur beim ersten Laden eines Plans true:
 * ein späteres `refresh()` lädt still im Hintergrund, damit Kalender und Scrollposition stehen bleiben.
 */
export function usePlanDetail(id: number | null) {
  const [plan, setPlan] = useState<PlanDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedId = useRef<number | null>(null)

  const load = useCallback(async () => {
    if (id == null) return
    const first = loadedId.current !== id
    if (first) setLoading(true)
    setError(null)
    try {
      const data = await invoke(IPC.PLANS_GET, id)
      setPlan(data)
      loadedId.current = id
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Plan konnte nicht geladen werden')
    } finally {
      if (first) setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  return { plan, loading, error, refresh: load }
}
