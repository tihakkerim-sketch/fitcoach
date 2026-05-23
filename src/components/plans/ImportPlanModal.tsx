import { useState } from 'react'
import { ClipboardCopy, Check, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import {
  parsePlanJson, toCreatePayload,
  CLAUDE_IMPORT_PROMPT, type ClaudePlan,
} from '@/lib/planImport'
import { PlanPreview } from './PlanPreview'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

type Step = 'paste' | 'preview'

export function ImportPlanModal({ open, onClose, onSaved }: Props) {
  const [step,       setStep]       = useState<Step>('paste')
  const [json,       setJson]       = useState('')
  const [parsed,     setParsed]     = useState<ClaudePlan | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [copied,     setCopied]     = useState(false)

  const reset = () => {
    setStep('paste'); setJson(''); setParsed(null)
    setParseError(null); setSaveError(null)
  }

  const handleClose = () => { reset(); onClose() }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_IMPORT_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* silent */ }
  }

  const handleParse = () => {
    setParseError(null)
    if (!json.trim()) { setParseError('Please paste the JSON from Claude first.'); return }
    try {
      setParsed(parsePlanJson(json))
      setStep('preview')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleImport = async () => {
    if (!parsed) return
    setSaving(true); setSaveError(null)
    try {
      await invoke<{ id: number }>(IPC.PLANS_CREATE, toCreatePayload(parsed))
      onSaved(); handleClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Plan from Claude</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {step === 'paste' && (
            <>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <p className="text-sm font-medium">Step 1 — Ask Claude to generate your plan</p>
                <p className="text-xs text-muted-foreground">
                  Copy the prompt below, paste it into{' '}
                  <a href="https://claude.ai" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    claude.ai
                  </a>{' '}
                  and tell it what plan you want.
                </p>
                <Button variant="outline" size="sm" onClick={copyPrompt} className="gap-2">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy Claude Prompt'}
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Step 2 — Paste Claude's JSON response</p>
                <textarea
                  className="w-full h-48 rounded-md border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={'{\n  "name": "My Plan",\n  "phases": [...]\n}'}
                  value={json}
                  onChange={e => { setJson(e.target.value); setParseError(null) }}
                  spellCheck={false}
                />
                {parseError && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{parseError}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 'preview' && parsed && (
            <>
              <p className="text-sm text-muted-foreground">
                Review the plan below. Click <strong>Import</strong> to save it.
              </p>
              <PlanPreview plan={parsed} />
              {saveError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{saveError}</span>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="pt-2 border-t">
          {step === 'paste' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleParse}>Preview Plan →</Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('paste')} disabled={saving}>← Back</Button>
              <Button onClick={handleImport} disabled={saving}>
                {saving ? 'Importing…' : 'Import Plan'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
