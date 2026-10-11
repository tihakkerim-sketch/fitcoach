import { useState } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { Check, AlertTriangle, Link2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import { useIntervalsSync, syncIntervalsNow } from '@/hooks/useIntervalsSync'

export function IntervalsSettings() {
  const { status, syncing, refreshStatus } = useIntervalsSync()
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const encryptionMissing = status != null && !status.encryptionAvailable

  const connect = async () => {
    const key = apiKey
    if (!key.trim() || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await invoke(IPC.INTERVALS_SET_KEY, { apiKey: key })
      // Schlüssel sofort aus dem Eingabefeld entfernen
      setApiKey('')
      setMessage({ ok: true, text: res.athleteName ? `Verbunden als ${res.athleteName}` : 'Verbunden.' })
      await refreshStatus()
      void syncIntervalsNow()
    } catch (e) {
      setApiKey('')
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Verbinden fehlgeschlagen.' })
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true)
      setTimeout(() => setConfirmDisconnect(false), 4000)
      return
    }
    setBusy(true)
    try {
      await invoke(IPC.INTERVALS_CLEAR_KEY)
      setMessage({ ok: true, text: 'Getrennt. Der Schlüssel wurde gelöscht.' })
      await refreshStatus()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Trennen fehlgeschlagen.' })
    } finally {
      setConfirmDisconnect(false)
      setBusy(false)
    }
  }

  return (
    <section className="vspace-3">
      <h2 className="font-semibold">intervals.icu (Garmin-Sync)</h2>
      <Separator />
      <p className="text-xs text-muted-foreground">
        So kommen deine Läufe automatisch in FitCoach: Garmin → intervals.icu → FitCoach.
        Den Schlüssel findest du auf intervals.icu unter Settings → Developer Settings → API Key.
        Er wird verschlüsselt auf diesem PC gespeichert.
      </p>

      {encryptionMissing && (
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Die Windows-Verschlüsselung ist nicht verfügbar. Der Schlüssel kann deshalb nicht sicher gespeichert werden.
        </p>
      )}

      {status?.configured ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <Check className="h-4 w-4 text-emerald-500" /> Verbunden
            </p>
            <p className="text-xs text-muted-foreground">
              {syncing
                ? 'Synchronisiere …'
                : status.lastSyncAt
                  ? `Letzter Sync: ${format(status.lastSyncAt, "d. MMM yyyy, HH:mm 'Uhr'", { locale: de })}`
                  : 'Noch nicht synchronisiert.'}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={disconnect} disabled={busy}>
            <Unlink className="h-3.5 w-3.5" />
            {confirmDisconnect ? 'Wirklich trennen?' : 'Trennen'}
          </Button>
        </div>
      ) : (
        <form
          className="flex items-end gap-2"
          onSubmit={e => { e.preventDefault(); void connect() }}
        >
          <div className="vspace-1 flex-1">
            <Label htmlFor="intervals-key">API-Schlüssel</Label>
            <Input
              id="intervals-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              disabled={encryptionMissing || busy}
              placeholder="Schlüssel von intervals.icu einfügen"
            />
          </div>
          <Button type="submit" className="gap-1.5" disabled={encryptionMissing || busy || apiKey.trim().length < 10}>
            <Link2 className="h-4 w-4" />
            {busy ? 'Prüfe …' : 'Verbinden'}
          </Button>
        </form>
      )}

      {message && (
        <p className={`text-xs ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}
    </section>
  )
}
