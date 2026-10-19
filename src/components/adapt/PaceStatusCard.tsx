import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import { emitDataChanged, onDataChanged } from '@/lib/dataEvents'
import { formatRaceTime } from '@/lib/raceTime'
import type { PaceStatusView } from '@/shared/adapt/views'

function statusText(s: PaceStatusView): string {
  switch (s.state) {
    case 'missing':
      return s.suggested10kSec
        ? `Leistung fehlt – Vorschlag aus deinen Läufen: 10 km in ${formatRaceTime(s.suggested10kSec)}.`
        : 'Leistung fehlt – trag sie in den Einstellungen ein (was du heute über 5 km, 10 km oder Halbmarathon laufen könntest).'
    case 'observing': return `Beobachte noch (${s.used} von 2 Tempo-Einheiten).`
    case 'ok': return 'Passt – deine Tempo-Ziele treffen dein aktuelles Niveau.'
    case 'mixed': return 'Daten uneinheitlich – mal schneller, mal langsamer. Noch keine Änderung.'
    case 'faster': return 'Du bist schneller geworden – siehe Vorschlag „Tempo-Ziele anpassen“.'
    case 'slower': return 'Die Tempo-Ziele sind gerade zu schnell – siehe Vorschlag „Tempo-Ziele anpassen“.'
  }
}

/** Karte „Tempo-Einschätzung“ auf der Plan-Seite. */
export function PaceStatusCard() {
  const [status, setStatus] = useState<PaceStatusView | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setStatus(await invoke(IPC.ADAPT_PACE_STATUS)) } catch { setStatus(null) }
  }, [])
  useEffect(() => { void load(); return onDataChanged(() => { void load() }) }, [load])

  if (!status) return null
  const accept = async () => {
    if (!status.suggested10kSec) return
    setBusy(true)
    try {
      await invoke(IPC.ADAPT_SET_PERFORMANCE, { distanceKm: 10, timeSec: status.suggested10kSec })
      emitDataChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 vspace-2" data-testid="pace-status">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <p className="font-semibold">Tempo-Einschätzung</p>
        {status.current10kSec != null && (
          <span className="text-xs text-muted-foreground">Leistung: 10 km in {formatRaceTime(status.current10kSec)}</span>
        )}
      </div>
      <p className="text-sm">{statusText(status)}</p>
      {status.state === 'missing' && status.suggested10kSec != null && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void accept()}>Übernehmen</Button>
      )}
      {status.history.length > 0 && (
        <ul className="text-xs text-muted-foreground vspace-1">
          {status.history.slice(0, 5).map(h => (
            <li key={h.at}>{format(new Date(h.at), 'dd.MM.yyyy')}: 10 km in {formatRaceTime(h.sec)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
