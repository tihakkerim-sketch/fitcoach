import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { UpdateStatus } from '@/types/ipc'

function statusText(s: UpdateStatus | null): string {
  if (!s) return ''
  switch (s.state) {
    case 'idle': return 'Noch nicht geprüft.'
    case 'checking': return 'Suche nach Updates …'
    case 'available': return `Update ${s.version ?? ''} gefunden, wird geladen …`
    case 'not-available': return 'Du hast die neueste Version.'
    case 'downloading': return `Update ${s.version ?? ''} wird geladen … ${s.percent ?? 0} %`
    case 'downloaded': return `Update ${s.version ?? ''} ist bereit zur Installation.`
    case 'error': return s.message ?? 'Update-Prüfung fehlgeschlagen.'
    case 'disabled': return s.message ?? 'Updates nur in der installierten App'
  }
}

export function UpdateSettings() {
  const [version, setVersion] = useState<string>('')
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    invoke(IPC.UPDATE_STATUS).then(setStatus).catch(() => {})
  }, [])

  useEffect(() => {
    invoke(IPC.APP_INFO).then(i => setVersion(i.version)).catch(() => {})
    refresh()
  }, [refresh])

  // Während Prüfung/Download den Status regelmäßig nachladen
  const active = status?.state === 'checking' || status?.state === 'available' || status?.state === 'downloading'
  useEffect(() => {
    if (!active) return
    const t = setInterval(refresh, 1000)
    return () => clearInterval(t)
  }, [active, refresh])

  const check = async () => {
    setBusy(true)
    try {
      setStatus(await invoke(IPC.UPDATE_CHECK))
    } catch (e) {
      setStatus({ state: 'error', message: e instanceof Error ? e.message : 'Update-Prüfung fehlgeschlagen.' })
    } finally {
      setBusy(false)
    }
  }

  const install = async () => {
    try { await invoke(IPC.UPDATE_INSTALL) } catch { /* App beendet sich */ }
  }

  return (
    <section className="vspace-3">
      <h2 className="font-semibold">App &amp; Updates</h2>
      <Separator />
      <p className="text-sm">Version {version || '–'}</p>
      <p className="text-xs text-muted-foreground" role="status">{statusText(status)}</p>
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={check} disabled={busy || active}>
          Nach Updates suchen
        </Button>
        {status?.state === 'downloaded' && (
          <Button size="sm" onClick={install}>Neu starten und installieren</Button>
        )}
      </div>
    </section>
  )
}
