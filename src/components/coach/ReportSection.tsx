import { useState } from 'react'
import { FileDown, Copy, Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import { today as getToday } from '@/lib/today'
import { addDaysStr, mondayOf } from '@/shared/planCalendar'

export function ReportSection() {
  const today = getToday()
  const [dateFrom, setDateFrom] = useState(() => addDaysStr(today, -6))
  const [dateTo, setDateTo] = useState(today)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

  const generate = async () => {
    setLoading(true); setError(null); setPreview(null); setCopied(false); setSaved(false)
    try {
      setPreview(await invoke(IPC.EXPORT_GENERATE_SUMMARY, { dateFrom, dateTo }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bericht konnte nicht erstellt werden')
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    if (!preview) return
    await navigator.clipboard.writeText(preview)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const save = async () => {
    if (!preview) return
    try {
      await invoke(IPC.EXPORT_SAVE_MD, { content: preview, filename: `coach-bericht-${today}.md` })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Datei konnte nicht gespeichert werden')
    }
  }

  const range = (from: string, to: string) => { setDateFrom(from); setDateTo(to) }
  const lastFullWeek = () => {
    const monday = mondayOf(addDaysStr(today, -7))
    range(monday, addDaysStr(monday, 6))
  }

  return (
    <div className="vspace-3">
      <p className="text-sm text-muted-foreground">
        Erstellt einen Bericht mit Status, Plan und Aktivitäten. Kopiere ihn in den Chat mit Claude, um Analyse und Planänderungen zu bekommen.
      </p>
      <div className="rounded-lg border bg-card p-4 vspace-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="vspace-1">
            <Label htmlFor="date-from">Aktivitäten im Zeitraum von</Label>
            <Input id="date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="vspace-1">
            <Label htmlFor="date-to">bis</Label>
            <Input id="date-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} max={today} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => range(addDaysStr(today, -6), today)}>Letzte 7 Tage</Button>
          <Button variant="outline" size="sm" onClick={lastFullWeek}>Letzte volle Woche</Button>
          <Button variant="outline" size="sm" onClick={() => range(addDaysStr(today, -29), today)}>Letzte 30 Tage</Button>
        </div>
        <Button onClick={generate} disabled={loading || !dateFrom || !dateTo}>
          {loading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Erstelle…</> : 'Bericht erstellen'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {preview && (
        <div className="vspace-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              Vorschau · {preview.split('\n').length} Zeilen · {(new Blob([preview]).size / 1024).toFixed(1)} KB
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? <><Check className="h-4 w-4 mr-1.5 text-green-500" /> Kopiert</> : <><Copy className="h-4 w-4 mr-1.5" /> Kopieren</>}
              </Button>
              <Button size="sm" onClick={save}>
                {saved ? <><Check className="h-4 w-4 mr-1.5" /> Gespeichert</> : <><FileDown className="h-4 w-4 mr-1.5" /> Als .md speichern</>}
              </Button>
            </div>
          </div>
          <ScrollArea className="h-72 rounded-lg border bg-muted/30">
            <pre className="p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground/80">{preview}</pre>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
