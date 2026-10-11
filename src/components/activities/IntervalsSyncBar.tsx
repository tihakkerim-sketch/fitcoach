import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { de } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { useIntervalsSync } from '@/hooks/useIntervalsSync'

export function IntervalsSyncBar() {
  const { status, syncing, lastError, syncNow } = useIntervalsSync()
  const [showErrors, setShowErrors] = useState(false)
  const [, tick] = useState(0)

  // „vor 5 Min“ alle 30 s aktualisieren
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  if (!status) return null

  if (!status.configured) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
        <span>intervals.icu nicht verbunden –{' '}
          <Link to="/settings" className="text-primary underline underline-offset-2">in den Einstellungen verbinden</Link>
        </span>
      </div>
    )
  }

  const result = status.lastResult
  const errors = result?.errors ?? []
  const when = status.lastSyncAt
    ? `zuletzt synchronisiert ${formatDistanceToNowStrict(status.lastSyncAt, { locale: de, addSuffix: true })}`
    : 'noch nicht synchronisiert'

  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground min-w-0">
          <span className="font-medium text-foreground">intervals.icu</span> · {when}
          {result && ` (${result.created} neu)`}
        </span>
        <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => void syncNow()} disabled={syncing}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchronisiere …' : 'Jetzt synchronisieren'}
        </Button>
      </div>

      {lastError && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {lastError}
        </p>
      )}

      {errors.length > 0 && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setShowErrors(v => !v)}
            className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
          >
            {errors.length} {errors.length === 1 ? 'Meldung' : 'Meldungen'} beim letzten Sync
            {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showErrors && (
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground vspace-0.5">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
