import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { LocalCoachResult, LocalCoachStatus } from '@/types/ipc'
import { today as getToday } from '@/lib/today'
import { addDaysStr } from '@/shared/planCalendar'
import { ChangeReview } from '@/components/coach/ChangeReview'

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function LocalCoachSection() {
  const today = getToday()
  const [starting, setStarting] = useState(false)
  const [status, setStatus] = useState<LocalCoachStatus>({ state: 'idle' })
  const [result, setResult] = useState<LocalCoachResult | null>(null)
  const [dateFrom, setDateFrom] = useState(() => addDaysStr(today, -6))
  const [dateTo, setDateTo] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [copied, setCopied] = useState(false)
  const alive = useRef(true)
  const prevKey = useRef<string>('idle')

  const loadResult = useCallback(() => {
    invoke(IPC.OLLAMA_LAST_RESULT).then(r => { if (alive.current) setResult(r) }).catch(() => {})
  }, [])

  const loadStatus = useCallback(() => {
    invoke(IPC.OLLAMA_STATUS).then(s => { if (alive.current) setStatus(s) }).catch(() => {})
  }, [])

  useEffect(() => {
    alive.current = true
    loadStatus()
    loadResult()
    return () => { alive.current = false }
  }, [loadStatus, loadResult])

  const running = status.state === 'connecting' || status.state === 'generating'

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => { setNow(Date.now()); loadStatus() }, 1000)
    return () => clearInterval(t)
  }, [running, loadStatus])

  // Ergebnis neu laden, wenn ein Lauf endet (auch Lauf-zu-Lauf: anderes startedAt)
  useEffect(() => {
    const key = status.state === 'done' ? `done-${status.startedAt}` : status.state
    const ended = status.state === 'done' || status.state === 'error' || status.state === 'cancelled'
    if (ended && key !== prevKey.current) loadResult()
    prevKey.current = key
  }, [status, loadResult])

  const start = async () => {
    if (starting) return
    setError(null); setStarting(true)
    try {
      await invoke(IPC.OLLAMA_START, { dateFrom, dateTo })
      const t0 = Date.now()
      setNow(t0)
      if (alive.current) setStatus({ state: 'connecting', startedAt: t0 })
      loadStatus()
    } catch (e) {
      if (alive.current) setError(errText(e, 'Der lokale Coach konnte nicht gestartet werden.'))
    } finally {
      if (alive.current) setStarting(false)
    }
  }

  const cancel = async () => {
    try { await invoke(IPC.OLLAMA_CANCEL) } catch { /* egal */ }
    loadStatus()
  }

  const copyRaw = async (raw: string) => {
    try {
      await navigator.clipboard.writeText(raw)
      setCopied(true)
      setTimeout(() => { if (alive.current) setCopied(false) }, 2500)
    } catch { /* Zwischenablage nicht verfügbar */ }
  }

  // Nach erfolgreichem Übernehmen vermerken, damit dasselbe Ergebnis nicht erneut angewendet wird
  const markApplied = () => {
    invoke(IPC.OLLAMA_MARK_APPLIED)
      .then(() => { if (alive.current) loadResult() })
      .catch(() => {})
  }

  const showResult = !!result && !running && !starting
  const isFallback = status.state === 'error' || status.state === 'cancelled'
  const changes = result?.answer.fitcoachChanges.changes ?? []

  return (
    <>
      <div className="vspace-3">
        <p className="text-sm text-muted-foreground">
          Schickt den Bericht an dein lokales KI-Modell. Die Antwort erscheint hier mit den vorgeschlagenen Plan-Änderungen.
        </p>
        <div className="rounded-lg border bg-card p-4 vspace-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="vspace-1">
              <Label htmlFor="local-date-from">Aktivitäten im Zeitraum von</Label>
              <Input id="local-date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="vspace-1">
              <Label htmlFor="local-date-to">bis</Label>
              <Input id="local-date-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} max={today} />
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Button onClick={start} disabled={running || starting || !dateFrom || !dateTo}>Lokalen Coach fragen</Button>
            {running && <Button variant="outline" onClick={cancel}>Abbrechen</Button>}
          </div>

          {status.state === 'connecting' && (
            <p className="text-sm text-muted-foreground" role="status">
              Verbinde / lade Modell … {mmss(now - status.startedAt)}
            </p>
          )}
          {status.state === 'generating' && (
            <p className="text-sm text-muted-foreground" role="status">
              Schreibt … {status.chars} Zeichen · {mmss(now - status.startedAt)}
            </p>
          )}
          {status.state === 'cancelled' && <p className="text-sm text-muted-foreground">Abgebrochen.</p>}
          {status.state === 'error' && (
            <div className="vspace-2">
              <p className="text-sm text-destructive">{status.message}</p>
              {status.raw && (
                <details>
                  <summary className="text-sm cursor-pointer text-muted-foreground">Rohantwort</summary>
                  <div className="vspace-2 mt-2">
                    <Button variant="outline" size="sm" onClick={() => copyRaw(status.raw!)}>
                      {copied ? <><Check className="h-4 w-4 mr-1.5 text-green-500" /> Kopiert</> : <><Copy className="h-4 w-4 mr-1.5" /> Kopieren</>}
                    </Button>
                    <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap">{status.raw}</pre>
                  </div>
                </details>
              )}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {result && !showResult && (
          <p className="text-sm text-muted-foreground">Vorherige Antwort wird ersetzt …</p>
        )}
        {result && showResult && (
          <div className="vspace-3">
            <div className="rounded-lg border bg-card p-4 vspace-2">
              <p className="text-sm whitespace-pre-wrap">{result.answer.explanation}</p>
              <p className="text-xs text-muted-foreground">
                {isFallback
                  ? `Letzte gültige Antwort vom ${format(new Date(result.createdAt), 'dd.MM.yyyy HH:mm')} · Modell ${result.model}`
                  : `Modell ${result.model} · ${format(new Date(result.createdAt), 'dd.MM.yyyy HH:mm')}`}
              </p>
            </div>
            {result.appliedAt ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Änderungen übernommen am {format(new Date(result.appliedAt), 'dd.MM.yyyy HH:mm')}.
              </p>
            ) : changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Plan-Änderungen vorgeschlagen.</p>
            ) : (
              <ChangeReview
                key={result.createdAt}
                initialText={JSON.stringify(result.answer.fitcoachChanges, null, 2)}
                onApplied={markApplied}
              />
            )}
          </div>
        )}
      </div>
    </>
  )
}
