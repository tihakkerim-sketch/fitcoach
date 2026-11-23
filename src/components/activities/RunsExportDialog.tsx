import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import { today as getToday } from '@/lib/today'
import { addDaysStr } from '@/shared/planCalendar'

interface Props {
  open: boolean
  onClose: () => void
}

export function RunsExportDialog({ open, onClose }: Props) {
  const today = getToday()
  const [dateFrom, setDateFrom] = useState(() => addDaysStr(today, -13))
  const [dateTo, setDateTo] = useState(today)
  const [preview, setPreview] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const range = (from: string, to: string) => { setDateFrom(from); setDateTo(to); setPreview(null); setCopied(false) }

  const copy = async () => {
    setLoading(true); setError(null); setCopied(false)
    try {
      const md = await invoke(IPC.EXPORT_RUNS, { dateFrom, dateTo })
      await navigator.clipboard.writeText(md)
      setPreview(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export konnte nicht erstellt werden')
    } finally {
      setLoading(false)
    }
  }

  const runCount = preview ? (preview.match(/^### /gm) ?? []).length : 0

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Läufe für Claude kopieren</DialogTitle>
          <DialogDescription>
            Kopiert die wichtigsten Werte aller Läufe im Zeitraum als Text. Danach in claude.ai einfügen.
          </DialogDescription>
        </DialogHeader>

        <div className="vspace-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="vspace-1">
              <Label htmlFor="runs-from">Von</Label>
              <Input id="runs-from" type="date" value={dateFrom} onChange={e => range(e.target.value, dateTo)} />
            </div>
            <div className="vspace-1">
              <Label htmlFor="runs-to">Bis</Label>
              <Input id="runs-to" type="date" value={dateTo} max={today} onChange={e => range(dateFrom, e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => range(addDaysStr(today, -6), today)}>Letzte 7 Tage</Button>
            <Button variant="outline" size="sm" onClick={() => range(addDaysStr(today, -13), today)}>Letzte 14 Tage</Button>
            <Button variant="outline" size="sm" onClick={() => range(addDaysStr(today, -27), today)}>Letzte 4 Wochen</Button>
            <Button variant="outline" size="sm" onClick={() => range(`${today.slice(0, 8)}01`, today)}>Aktueller Monat</Button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={copy} disabled={loading || !dateFrom || !dateTo}>
              {loading
                ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Erstelle…</>
                : <><Copy className="h-4 w-4 mr-2" /> Kopieren</>}
            </Button>
            {copied && (
              <span className="text-sm text-green-600 flex items-center gap-1.5">
                <Check className="h-4 w-4" /> Kopiert ✓ – in Claude einfügen
              </span>
            )}
            {preview && (
              <span className="text-xs text-muted-foreground">
                {runCount} {runCount === 1 ? 'Lauf' : 'Läufe'} · {preview.split('\n').length} Zeilen
              </span>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {preview && (
            <div className="vspace-2">
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setShowPreview(v => !v)}
                aria-expanded={showPreview}
              >
                {showPreview ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Vorschau
              </button>
              {showPreview && (
                <ScrollArea className="h-72 rounded-lg border bg-muted/30">
                  <pre className="p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground/80">{preview}</pre>
                </ScrollArea>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
