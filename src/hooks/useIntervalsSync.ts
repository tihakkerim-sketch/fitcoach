import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { invoke } from '@/lib/ipc'
import { emitDataChanged } from '@/lib/dataEvents'
import { IPC } from '@/types/ipc'
import type { IntervalsStatus } from '@/types/ipc'

// Modul-weiter Zustand: Layout und Seiten sehen denselben Stand.
interface State {
  status: IntervalsStatus | null
  syncing: boolean
  lastError: string | null
}

let state: State = { status: null, syncing: false, lastError: null }
const listeners = new Set<() => void>()
let autoSyncStarted = false

function setState(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach(l => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export async function refreshIntervalsStatus(): Promise<IntervalsStatus | null> {
  try {
    const status = await invoke(IPC.INTERVALS_STATUS)
    setState({ status })
    return status
  } catch (e) {
    setState({ lastError: e instanceof Error ? e.message : 'Status konnte nicht geladen werden.' })
    return null
  }
}

export async function syncIntervalsNow(): Promise<void> {
  if (state.syncing) return
  setState({ syncing: true, lastError: null })
  try {
    await invoke(IPC.INTERVALS_SYNC)
    await refreshIntervalsStatus()
    emitDataChanged()
  } catch (e) {
    setState({ lastError: e instanceof Error ? e.message : 'Synchronisation fehlgeschlagen.' })
    await refreshIntervalsStatus()
  } finally {
    setState({ syncing: false })
  }
}

/** Einmal pro App-Start synchronisieren, wenn verbunden (Flag schützt vor StrictMode-Doppelaufruf). */
export async function autoSyncOnce(): Promise<void> {
  if (autoSyncStarted) return
  autoSyncStarted = true
  const status = await refreshIntervalsStatus()
  if (status?.configured) await syncIntervalsNow()
}

export function useIntervalsSync() {
  const snap = useSyncExternalStore(subscribe, () => state)

  useEffect(() => {
    if (state.status === null) void refreshIntervalsStatus()
  }, [])

  const syncNow = useCallback(() => syncIntervalsNow(), [])
  const refreshStatus = useCallback(() => refreshIntervalsStatus(), [])

  return {
    status: snap.status,
    syncing: snap.syncing,
    lastError: snap.lastError,
    syncNow,
    refreshStatus,
  }
}
