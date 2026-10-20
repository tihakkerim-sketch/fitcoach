import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
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

type SectionComponent = ComponentType<{ title: string; children: ReactNode }>

export function LocalCoachSection({ Section }: { Section: SectionComponent }) {
  const today = getToday()
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<LocalCoachStatus>({ state: 'idle' })
  const [result, setResult] = useState<LocalCoachResult | null>(null)
  const [dateFrom, setDateFrom] = useState(() => addDaysStr(today, -6))
  const [dateTo, setDateTo] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [copied, setCopied] = useState(false)
  const alive = useRef(true)
  const prevState = useRef<string>('idle')

  const loadResult = useCallback(() => {
    invoke(IPC.OLLAMA_LAST_RESULT).then(r => { if (alive.current) setResult(r) }).catch(() => {})
  }, [])

  const loadStatus = useCallback(() => {
    invoke(IPC.OLLAMA_STATUS).then(s => { if (alive.current) setStatus(s) }).catch(() => {})
  }, [])

  useEffect(() => {
    alive.current = true
    invoke(IPC.OLLAMA_SETTINGS_GET).then(s => { if (alive.current) setEnabled(s.enabled) }).catch(() => {})
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

  useEffect(() => {
    if (status.state === 'done' && prevState.current !== 'done') loadResult()
    prevState.current = status.state
  }, [status.state, loadResult])

  if (!enabled) return null

  const start = async () => {
    setError(null)
    try {
      await invoke(IPC.OLLAMA_START, { dateFrom, dateTo })
      setNow(Date.now())
      loadStatus()
    } catch (e) {
      setError(errText(e, 'Der lokale Coach konnte nicht gestartet werden.'))
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

  const changes = result?.answer.fitcoachChanges.changes ?? []

  return (
    <Section title="Lokaler Coach">
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
            <Button onClick={start} disabled={running || !dateFrom || !dateTo}>Lokalen Coach fragen</Button>
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

        {result && (
          <div className="vspace-3">
            <div className="rounded-lg border bg-card p-4 vspace-2">
              <p className="text-sm whitespace-pre-wrap">{result.answer.explanation}</p>
              <p className="text-xs text-muted-foreground">
                Modell {result.model} · {format(new Date(result.createdAt), 'dd.MM.yyyy HH:mm')}
              </p>
            </div>
            {changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Plan-Änderungen vorgeschlagen.</p>
            ) : (
              <ChangeReview
                key={result.createdAt}
                initialText={JSON.stringify(result.answer.fitcoachChanges, null, 2)}
              />
            )}
          </div>
        )}
      </div>
    </Section>
  )
}
