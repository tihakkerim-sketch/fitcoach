import { useState } from 'react'
import { ClipboardCopy, Check, AlertCircle, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { AdaptPlanResult } from '@/types/ipc'
import {
  parsePlanJson, toCreatePayload,
  CLAUDE_ADAPT_PROMPT, type ClaudePlan,
} from '@/lib/planImport'
import { PlanPreview } from './PlanPreview'

interface Props {
  open:     boolean
  onClose:  () => void
  onSaved:  () => void
  planId:   number
  planName: string
}

type Step = 'paste' | 'preview' | 'done'

export function AdaptPlanModal({ open, onClose, onSaved, planId, planName }: Props) {
  const [step,       setStep]       = useState<Step>('paste')
  const [json,       setJson]       = useState('')
  const [parsed,     setParsed]     = useState<ClaudePlan | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [result,     setResult]     = useState<AdaptPlanResult | null>(null)
  const [copied,     setCopied]     = useState(false)

  const reset = () => {
    setStep('paste'); setJson(''); setParsed(null)
    setParseError(null); setSaveError(null); setResult(null)
  }

  const handleClose = () => { reset(); onClose() }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_ADAPT_PROMPT)
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

  const handleAdapt = async () => {
    if (!parsed) return
    setSaving(true); setSaveError(null)
    try {
      const payload = { planId, ...toCreatePayload(parsed) }
      const res = await invoke<AdaptPlanResult>(IPC.PLANS_ADAPT, payload)
      setResult(res)
      setStep('done')
      onSaved()
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
          <DialogTitle>Adapt Plan — {planName}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">

          {/* ── Step: paste ── */}
          {step === 'paste' && (
            <>
              {/* How it works callout */}
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/8 p-4">
                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-sm space-y-1">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">Your progress is safe</p>
                  <p className="text-muted-foreground text-xs">
                    Completed and skipped sessions are preserved and automatically
                    re-applied to matching days in the updated plan. Only future
                    <em> planned</em> sessions are replaced.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <p className="text-sm font-medium">Step 1 — Get Claude to adapt your plan</p>
                <p className="text-xs text-muted-foreground">
                  Copy the prompt, share your weekly stats with{' '}
                  <a href="https://claude.ai" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    claude.ai
                  </a>{' '}
                  and paste the JSON it gives back below.
                </p>
                <Button variant="outline" size="sm" onClick={copyPrompt} className="gap-2">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy Adapt Prompt'}
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Step 2 — Paste Claude's updated JSON</p>
                <textarea
                  className="w-full h-48 rounded-md border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={'{\n  "name": "Updated Plan",\n  "phases": [...]\n}'}
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

          {/* ── Step: preview ── */}
          {step === 'preview' && parsed && (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3">
                <ShieldCheck className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Planned</strong> sessions will be replaced.{' '}
                  <strong className="text-foreground">Completed & skipped</strong> sessions are
                  preserved and re-applied where the day still matches.
                </p>
              </div>

              <PlanPreview plan={parsed} />

              {saveError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{saveError}</span>
                </div>
              )}
            </>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && result && (
            <div className="py-4 space-y-4 text-center">
              <div className="text-4xl">✅</div>
              <p className="font-semibold text-lg">Plan updated!</p>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1 text-left">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed / skipped sessions found</span>
                  <span className="font-semibold">{result.preserved}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Restored onto matching days</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{result.restored}</span>
                </div>
                {result.preserved > result.restored && (
                  <p className="text-xs text-muted-foreground pt-1">
                    {result.preserved - result.restored} session{result.preserved - result.restored !== 1 ? 's' : ''} had
                    no matching day in the new structure and were not carried over.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t">
          {step === 'paste' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleParse}>Preview Changes →</Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('paste')} disabled={saving}>← Back</Button>
              <Button onClick={handleAdapt} disabled={saving}>
                {saving ? 'Adapting…' : 'Apply Adapted Plan'}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
