import { useState } from 'react'
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns'
import { FileDown, Copy, Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'

function defaultRange() {
  const today = new Date()
  const start = startOfWeek(subDays(today, 7), { weekStartsOn: 1 })
  const end   = endOfWeek(subDays(today, 7), { weekStartsOn: 1 })
  return {
    from: format(start, 'yyyy-MM-dd'),
    to:   format(end,   'yyyy-MM-dd'),
  }
}

export default function Export() {
  const def = defaultRange()
  const [dateFrom, setDateFrom] = useState(def.from)
  const [dateTo,   setDateTo]   = useState(def.to)
  const [preview,  setPreview]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [copied,   setCopied]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  const generate = async () => {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    setError(null)
    setPreview(null)
    setCopied(false)
    setSaved(false)
    try {
      const md = await invoke<string>(IPC.EXPORT_GENERATE_SUMMARY, { dateFrom, dateTo })
      setPreview(md)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate summary')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    if (!preview) return
    await navigator.clipboard.writeText(preview)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const saveFile = async () => {
    if (!preview) return
    const filename = `training-summary-${dateFrom}-to-${dateTo}.md`
    try {
      await invoke(IPC.EXPORT_SAVE_MD, { content: preview, filename })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save file')
    }
  }

  // Quick-select helpers
  const selectLastWeek = () => {
    const d = defaultRange()
    setDateFrom(d.from)
    setDateTo(d.to)
  }

  const selectLast7Days = () => {
    const today = new Date()
    setDateFrom(format(subDays(today, 6), 'yyyy-MM-dd'))
    setDateTo(format(today, 'yyyy-MM-dd'))
  }

  const selectLast30Days = () => {
    const today = new Date()
    setDateFrom(format(subDays(today, 29), 'yyyy-MM-dd'))
    setDateTo(format(today, 'yyyy-MM-dd'))
  }

  return (
    <div className="flex flex-col h-full p-6 gap-5">
      <div>
        <h1 className="text-2xl font-bold">Export Summary</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate a Markdown summary of your training — paste it into Claude chat to get analysis and planning advice.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="date-from">From</Label>
            <Input id="date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="date-to">To</Label>
            <Input id="date-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} max={format(new Date(), 'yyyy-MM-dd')} />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={selectLastWeek}>Last full week</Button>
          <Button variant="outline" size="sm" onClick={selectLast7Days}>Last 7 days</Button>
          <Button variant="outline" size="sm" onClick={selectLast30Days}>Last 30 days</Button>
        </div>

        <Button onClick={generate} disabled={loading || !dateFrom || !dateTo} className="w-full sm:w-auto">
          {loading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : 'Generate Summary'}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Preview + actions */}
      {preview && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              Preview — {preview.split('\n').length} lines · {(new Blob([preview]).size / 1024).toFixed(1)} KB
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                {copied ? <><Check className="h-4 w-4 mr-1.5 text-green-500" /> Copied!</> : <><Copy className="h-4 w-4 mr-1.5" /> Copy to Clipboard</>}
              </Button>
              <Button size="sm" onClick={saveFile}>
                {saved ? <><Check className="h-4 w-4 mr-1.5" /> Saved!</> : <><FileDown className="h-4 w-4 mr-1.5" /> Save .md File</>}
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 rounded-lg border bg-muted/30">
            <pre className="p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground/80">
              {preview}
            </pre>
          </ScrollArea>

          <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-sm text-muted-foreground">
            <strong className="text-foreground">How to use:</strong> Copy to clipboard, go to{' '}
            <span className="font-medium text-foreground">claude.ai</span>, paste the summary, then ask Claude to evaluate your week or build your next training phase.
          </div>
        </div>
      )}
    </div>
  )
}
