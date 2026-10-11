import { useEffect, useState } from 'react'
import { ClipboardCopy, Check, AlertCircle, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { AdaptPlanResult, PlanDetail } from '@/types/ipc'
import {
  parsePlanJson, toCreatePayload, buildAdaptPrompt, type ParsedPlan,
} from '@/lib/planImport'
import { isMonday, todayLocal } from '@/shared/planCalendar'
import { PlanPreview } from './PlanPreview'
import { fmtDate } from './sessionFormat'

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
  const [detail,     setDetail]     = useState<PlanDetail | null>(null)
  const [json,       setJson]       = useState('')
  const [parsed,     setParsed]     = useState<ParsedPlan | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [result,     setResult]     = useState<AdaptPlanResult | null>(null)
  const [copied,     setCopied]     = useState(false)

  // Aktuellen Plan laden (für den Prompt mit dem Plan als JSON)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    invoke(IPC.PLANS_GET, planId)
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(e => { if (!cancelled) setParseError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [open, planId])

  const reset = () => {
    setStep('paste'); setJson(''); setParsed(null)
    setParseError(null); setSaveError(null); setResult(null)
  }

  const handleClose = () => { reset(); onClose() }

  const copyPrompt = async () => {
    if (!detail) return
    try {
      await navigator.clipboard.writeText(buildAdaptPrompt(detail, todayLocal()))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* Zwischenablage nicht verfügbar */ }
  }

  const handleParse = () => {
    setParseError(null)
    if (!json.trim()) { setParseError('Bitte zuerst das JSON von Claude einfügen.'); return }
    try {
      setParsed(parsePlanJson(json))
      setStep('preview')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e))
    }
  }

  const startDate = parsed ? (parsed.startDate ?? detail?.startDate ?? null) : null

  const handleAdapt = async () => {
    if (!parsed) return
    if (!startDate) { setSaveError('Der Plan konnte nicht geladen werden.'); return }
    if (!isMonday(startDate)) { setSaveError('Das Startdatum im JSON muss ein Montag sein.'); return }
    setSaving(true); setSaveError(null)
    try {
      const res = await invoke(IPC.PLANS_ADAPT, { planId, ...toCreatePayload(parsed, startDate) })
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
          <DialogTitle>Mit Claude anpassen – {planName}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto vspace-4 pr-1">

          {step === 'paste' && (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/8 p-4">
                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-sm vspace-1">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">Dein Fortschritt bleibt erhalten</p>
                  <p className="text-muted-foreground text-xs">
                    Erledigte und übersprungene Einheiten werden übernommen, wenn Woche, Tag und Typ
                    im neuen Plan gleich bleiben. Alle anderen Einheiten werden ersetzt.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 vspace-2">
                <p className="text-sm font-medium">Schritt 1 – Claude den Plan anpassen lassen</p>
                <p className="text-xs text-muted-foreground">
                  Der Prompt enthält deinen aktuellen Plan. Füge ihn bei{' '}
                  <a href="https://claude.ai" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    claude.ai
                  </a>{' '}
                  ein, schreibe dazu, was sich ändern soll, und füge die Antwort unten ein.
                </p>
                <Button variant="outline" size="sm" onClick={copyPrompt} disabled={!detail} className="gap-2">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4" />}
                  {copied ? 'Kopiert!' : 'Prompt kopieren'}
                </Button>
              </div>

              <div className="vspace-2">
                <p className="text-sm font-medium">Schritt 2 – Angepasstes JSON von Claude einfügen</p>
                <textarea
                  className="w-full h-48 rounded-md border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-hidden focus:ring-2 focus:ring-ring"
                  placeholder={'{\n  "version": 2,\n  "name": "Angepasster Plan",\n  "weeks": [...]\n}'}
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
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3">
                <ShieldCheck className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Geplante</strong> Einheiten werden ersetzt.{' '}
                  <strong className="text-foreground">Erledigte und übersprungene</strong> Einheiten
                  bleiben, wo Woche, Tag und Typ noch passen.
                </p>
              </div>

              <PlanPreview plan={parsed} />

              {startDate && (
                <p className="text-xs text-muted-foreground">
                  Startdatum: <strong className="text-foreground">{fmtDate(startDate)}</strong>
                </p>
              )}

              {saveError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{saveError}</span>
                </div>
              )}
            </>
          )}

          {step === 'done' && result && (
            <div className="py-4 vspace-4 text-center">
              <div className="text-4xl">✅</div>
              <p className="font-semibold text-lg">Plan angepasst!</p>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm vspace-1 text-left">
                <p className="font-medium">
                  {result.restored} von {result.preserved} erledigten Einheiten übernommen
                </p>
                {result.preserved > result.restored && (
                  <p className="text-xs text-muted-foreground pt-1">
                    {result.preserved - result.restored} {result.preserved - result.restored === 1 ? 'Einheit hatte' : 'Einheiten hatten'}{' '}
                    im neuen Plan keinen passenden Tag und {result.preserved - result.restored === 1 ? 'wurde' : 'wurden'} nicht übernommen.
                  </p>
                )}
              </div>
            </div>
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
              <Button onClick={handleAdapt} disabled={saving}>
                {saving ? 'Wird angepasst …' : 'Angepassten Plan übernehmen'}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={handleClose}>Schließen</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
