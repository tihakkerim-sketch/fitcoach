import { useEffect, useState } from 'react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { CoachStatus } from '@/shared/coach'
import { onDataChanged } from '@/lib/dataEvents'

/** Lädt den Coach-Status und aktualisiert ihn bei Datenänderungen. */
export function useCoachStatus() {
  const [status, setStatus] = useState<CoachStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = () => {
      invoke(IPC.COACH_STATUS)
        .then(s => { if (alive) { setStatus(s); setError(null) } })
        .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Status konnte nicht geladen werden') })
        .finally(() => { if (alive) setLoading(false) })
    }
    load()
    const off = onDataChanged(load)
    return () => { alive = false; off() }
  }, [])

  return { status, error, loading }
}
