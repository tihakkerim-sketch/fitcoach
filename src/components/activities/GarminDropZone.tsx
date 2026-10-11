import { useState, useCallback, useRef } from 'react'
import { Upload, Check, Copy, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { ImportFileResult } from '@/types/ipc'
import { cn } from '@/lib/utils'
import { emitDataChanged } from '@/lib/dataEvents'

interface Props {
  /** Optional: wird nach jedem Import mit der Ergebnisliste aufgerufen. */
  onImported?: (results: ImportFileResult[]) => void
}

const isGarminFile = (f: File) => /\.(fit|tcx)$/i.test(f.name)

export function GarminDropZone({ onImported }: Props) {
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ImportFileResult[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const importFiles = useCallback(async (list: File[]) => {
    const files = list.filter(isGarminFile)
    if (files.length === 0) {
      setError('Es werden nur .fit- und .tcx-Dateien unterstützt.')
      return
    }
    setBusy(true)
    setError(null)
    setResults(null)
    try {
      const payload = await Promise.all(files.map(async f => ({
        fileName: f.name,
        data: new Uint8Array(await f.arrayBuffer()),
      })))
      const res = await invoke(IPC.GARMIN_IMPORT_FILES, { files: payload })
      setResults(res)
      emitDataChanged()
      onImported?.(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }, [onImported])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void importFiles(Array.from(e.dataTransfer.files))
  }, [importFiles])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) void importFiles(files)
    e.target.value = '' // dieselbe Datei erneut wählbar
  }, [importFiles])

  const created = results?.filter(r => r.status === 'created').length ?? 0
  const duplicates = results?.filter(r => r.status === 'duplicate').length ?? 0
  const failed = results?.filter(r => r.status === 'error') ?? []

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50',
        busy && 'pointer-events-none opacity-60'
      )}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".fit,.tcx"
        multiple
        className="hidden"
        onChange={onFileChange}
      />
      <Upload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {busy ? 'Dateien werden importiert …' : 'Garmin-Dateien (.fit / .tcx) hierher ziehen oder'}
      </p>
      {!busy && (
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          Dateien auswählen
        </Button>
      )}

      {results && (
        <div className="w-full max-w-xl text-xs">
          <p className="text-center font-medium text-foreground">
            {created} neu · {duplicates} doppelt · {failed.length} Fehler
          </p>
          <ul className="mt-2 vspace-1">
            {results.map((r, i) => (
              <li key={`${r.fileName}-${i}`} className="flex items-start gap-2">
                {r.status === 'created' && <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />}
                {r.status === 'duplicate' && <Copy className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />}
                {r.status === 'error' && <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />}
                <span className="min-w-0 break-words">
                  <span className="font-medium text-foreground">{r.fileName}</span>
                  <span className={r.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
                    {' – '}
                    {r.status === 'created' ? 'neu importiert'
                      : r.status === 'duplicate' ? (r.message ?? 'doppelt, übersprungen')
                      : (r.message ?? 'Fehler')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
