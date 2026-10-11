import { useState } from 'react'
import { ClipboardCopy, Check, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import {
  parsePlanJson, toCreatePayload,
  CLAUDE_IMPORT_PROMPT, type ParsedPlan,
} from '@/lib/planImport'
import { todayLocal } from '@/shared/planCalendar'
import { PlanPreview } from './PlanPreview'
import { StartDateField, effectiveStart } from './StartDateField'
import { nextMonday } from './sessionFormat'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

type Step = 'paste' | 'preview'

export function ImportPlanModal({ open, onClose, onSaved }: Props) {
  const [step,       setStep]       = useState<Step>('paste')
  const [json,       setJson]       = useState('')
  const [parsed,     setParsed]     = useState<ParsedPlan | null>(null)
  const [start,      setStart]      = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [copied,     setCopied]     = useState(false)

  const reset = () => {
    setStep('paste'); setJson(''); setParsed(null); setStart('')
    setParseError(null); setSaveError(null)
  }

  const handleClose = () => { reset(); onClose() }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_IMPORT_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* Zwischenablage nicht verfügbar */ }
  }

  const handleParse = () => {
    setParseError(null)
    if (!json.trim()) { setParseError('Bitte zuerst das JSON von Claude einfügen.'); return }
    try {
      const plan = parsePlanJson(json)
      setParsed(plan)
      setStart(plan.startDate ?? nextMonday(todayLocal()))
      setStep('preview')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleImport = async () => {
    if (!parsed) return
    const startDate = effectiveStart(start)
    if (!startDate) { setSaveError('Bitte ein Startdatum wählen.'); return }
    setSaving(true); setSaveError(null)
    try {
      await invoke(IPC.PLANS_CREATE, toCreatePayload(parsed, startDate))
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
          <DialogTitle>Plan aus Claude importieren</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto vspace-4 pr-1">
          {step === 'paste' && (
            <>
              <div className="rounded-lg border bg-muted/30 p-4 vspace-2">
                <p className="text-sm font-medium">Schritt 1 – Claude den Plan erstellen lassen</p>
                <p className="text-xs text-muted-foreground">
                  Kopiere den Prompt, füge ihn bei{' '}
                  <a href="https://claude.ai" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    claude.ai
                  </a>{' '}
                  ein und ergänze deine Angaben (Ziel, Startdatum, Trainingstage).
                </p>
                <Button variant="outline" size="sm" onClick={copyPrompt} className="gap-2">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4" />}
                  {copied ? 'Kopiert!' : 'Prompt kopieren'}
                </Button>
              </div>

              <div className="vspace-2">
                <p className="text-sm font-medium">Schritt 2 – Antwort von Claude (JSON) einfügen</p>
                <textarea
                  className="w-full h-48 rounded-md border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-hidden focus:ring-2 focus:ring-ring"
                  placeholder={'{\n  "version": 2,\n  "name": "Mein Plan",\n  "weeks": [...]\n}'}
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
                Prüfe den Plan und wähle das Startdatum. Mit <strong>Importieren</strong> wird er gespeichert.
              </p>
              <PlanPreview plan={parsed} />
              <StartDateField id="imp-start" value={start} onChange={setStart} />
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
              <Button variant="outline" onClick={handleClose}>Abbrechen</Button>
              <Button onClick={handleParse}>Vorschau →</Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('paste')} disabled={saving}>← Zurück</Button>
              <Button onClick={handleImport} disabled={saving}>
                {saving ? 'Wird importiert …' : 'Importieren'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
