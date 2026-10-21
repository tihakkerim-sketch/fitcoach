import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { LocalCoachResult } from '@/types/ipc'

const fmt = (iso: string) => format(new Date(iso), 'dd.MM.yyyy HH:mm')

function changeLine(h: LocalCoachResult): string {
  const k = h.answer.fitcoachChanges.changes.length
  if (k === 0) return 'Keine Änderungen vorgeschlagen'
  const n = `${k} Änderung${k === 1 ? '' : 'en'} vorgeschlagen`
  return h.appliedAt ? `${n} · übernommen am ${fmt(h.appliedAt)}` : `${n} · nicht übernommen`
}

/** Schreibgeschützter Verlauf der letzten Antworten; `reloadKey` ändert sich, wenn neu geladen werden soll. */
export function LocalCoachHistory({ reloadKey }: { reloadKey: string }) {
  const [history, setHistory] = useState<LocalCoachResult[]>([])
  const [open, setOpen] = useState(false)
  const alive = useRef(true)

  const load = useCallback(() => {
    invoke(IPC.OLLAMA_HISTORY).then(h => { if (alive.current) setHistory(h) }).catch(() => {})
  }, [])

  useEffect(() => {
    alive.current = true
    load()
    return () => { alive.current = false }
  }, [load, reloadKey])

  const clear = async () => {
    if (!window.confirm('Verlauf wirklich löschen?')) return
    try { await invoke(IPC.OLLAMA_HISTORY_CLEAR) } catch { /* egal */ }
    load()
  }

  if (history.length === 0) return null

  return (
    <details className="rounded-lg border bg-card p-4" onToggle={e => setOpen(e.currentTarget.open)}>
      <summary className="text-sm font-medium cursor-pointer">Verlauf ({history.length})</summary>
      {/* Inhalt nur im geöffneten Zustand rendern (sonst doppelt zur aktuellen Antwort) */}
      {open && (
      <div className="vspace-3 mt-3" aria-label="Verlauf" role="group">
        {history.map(h => (
          <div key={h.createdAt} className="rounded-md border p-3 vspace-1">
            <p className="text-xs text-muted-foreground">
              {fmt(h.createdAt)} · Modell {h.model}
              {h.followUp && ' · Nachfrage'}
            </p>
            {h.message && <p className="text-sm text-muted-foreground whitespace-pre-wrap">Du: {h.message}</p>}
            <p className="text-sm whitespace-pre-wrap">
              <span className="font-medium">Coach: </span>
              {h.answer.explanation}
            </p>
            <p className="text-xs text-muted-foreground">{changeLine(h)}</p>
          </div>
        ))}
      </div>
      )}
      {open && (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={clear}>Verlauf löschen</Button>
        </div>
      )}
    </details>
  )
}
