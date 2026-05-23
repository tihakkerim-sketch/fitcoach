import { useState, useCallback, useRef } from 'react'
import { Upload, FileCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { CreateActivityPayload } from '@/types/ipc'
import { cn } from '@/lib/utils'

interface Props {
  onParsed: (data: Partial<CreateActivityPayload>) => void
}

export function GarminDropZone({ onParsed }: Props) {
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parseFile = useCallback(async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext !== 'fit' && ext !== 'tcx') {
      setError('Only .fit and .tcx files are supported')
      return
    }
    setParsing(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const uint8 = new Uint8Array(buffer)
      const result = await invoke<Partial<CreateActivityPayload>>(IPC.GARMIN_PARSE, {
        fileName: file.name,
        data: Array.from(uint8),
      })
      setFileName(file.name)
      onParsed({ ...result, source: 'garmin_import', garminFileName: file.name })
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to parse .${ext} file`)
    } finally {
      setParsing(false)
    }
  }, [onParsed])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }, [parseFile])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }, [parseFile])

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50',
        parsing && 'pointer-events-none opacity-60'
      )}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".fit,.tcx"
        className="hidden"
        onChange={onFileChange}
      />

      {fileName ? (
        <>
          <FileCheck className="h-8 w-8 text-primary" />
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-primary">{fileName}</p>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary">
              {fileName.toLowerCase().endsWith('.tcx') ? 'TCX' : 'FIT'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Form pre-filled from Garmin data</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setFileName(null); fileInputRef.current?.click() }}
          >
            Change file
          </Button>
        </>
      ) : (
        <>
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {parsing
              ? `Parsing file…`
              : 'Drag & drop a .fit or .tcx file, or'}
          </p>
          {!parsing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse file
            </Button>
          )}
          {!parsing && (
            <p className="text-[11px] text-muted-foreground/60">Supports Garmin .fit and .tcx formats</p>
          )}
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
