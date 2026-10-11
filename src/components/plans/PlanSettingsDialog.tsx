import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { PlanRow } from '@/types/ipc'
import { StartDateField, effectiveStart } from './StartDateField'

interface Props {
  mode: 'start' | 'weeks'
  plan: PlanRow
  onClose: () => void
  onSaved: () => void
}

/** Startdatum oder Anzahl der Wochen eines Plans ändern. Fehler vom Server bleiben im Dialog sichtbar. */
export function PlanSettingsDialog({ mode, plan, onClose, onSaved }: Props) {
  const [start, setStart] = useState(plan.startDate)
  const [weeks, setWeeks] = useState(String(plan.weekCount))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    let payload: { planId: number; startDate?: string; weekCount?: number }
    if (mode === 'start') {
      const startDate = effectiveStart(start)
      if (!startDate) { setError('Bitte ein Startdatum wählen.'); return }
      payload = { planId: plan.id, startDate }
    } else {
      const weekCount = Number(weeks)
      if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 52) {
        setError('Die Anzahl der Wochen muss zwischen 1 und 52 liegen.'); return
      }
      payload = { planId: plan.id, weekCount }
    }
    setSaving(true)
    try {
      await invoke(IPC.PLANS_UPDATE, payload)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === 'start' ? 'Startdatum ändern' : 'Anzahl Wochen ändern'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} noValidate className="vspace-4">
          {mode === 'start' ? (
            <>
              <StartDateField id="ps-start" value={start} onChange={setStart} />
              <p className="text-xs text-muted-foreground">
                Alle Einheiten verschieben sich mit. Automatische Zuordnungen zu Läufen werden neu berechnet.
              </p>
            </>
          ) : (
            <div className="vspace-1">
              <Label htmlFor="ps-weeks">Wochen (1–52)</Label>
              <Input id="ps-weeks" type="number" min={1} max={52} value={weeks} onChange={e => setWeeks(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Verlängern hängt leere Wochen an. Verkürzen geht nur, wenn die wegfallenden Wochen keine Einheiten enthalten.
              </p>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Abbrechen</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
