import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/contexts/ToastContext'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import { emitDataChanged, onDataChanged } from '@/lib/dataEvents'
import { cn } from '@/lib/utils'
import type { PendingFeedback } from '@/shared/adapt/views'

/** Dialog nach jedem neuen, einer Plan-Einheit zugeordneten Lauf (global im Layout). */
export function FeedbackDialog() {
  const [pending, setPending] = useState<PendingFeedback[]>([])
  const [effort, setEffort] = useState<number | null>(null)
  const [pain, setPain] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try { setPending(await invoke(IPC.ADAPT_PENDING_FEEDBACK)) } catch { setPending([]) }
  }, [])
  useEffect(() => { void load(); return onDataChanged(() => { void load() }) }, [load])

  const current = pending[0] ?? null

  const submit = async (skipped: boolean) => {
    if (!current || busy) return
    setBusy(true)
    try {
      const created = await invoke(IPC.ADAPT_FEEDBACK, {
        activityId: current.activityId,
        effort: skipped ? null : effort,
        pain: skipped ? false : pain,
        notes: skipped ? null : notes.trim() || null,
        skipped,
      })
      if (!skipped && created.length === 0) toast({ message: 'Plan passt so.', duration: 3000 })
      setEffort(null)
      setPain(false)
      setNotes('')
      setPending(p => p.slice(1))
      emitDataChanged()
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Speichern fehlgeschlagen.', duration: 5000 })
    } finally {
      setBusy(false)
    }
  }

  if (!current) return null
  const dateText = format(new Date(`${current.date}T12:00:00`), 'EEEE, d.M.', { locale: de })
  const km = current.distanceKm ? ` · ${current.distanceKm.toFixed(1).replace('.', ',')} km` : ''

  return (
    <Dialog open onOpenChange={o => { if (!o) void submit(true) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Wie war&apos;s?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {current.sessionTitle ? `${current.sessionTitle} – ` : 'Lauf am '}{dateText}{km}
          </p>
        </DialogHeader>
        <div className="vspace-4">
          <div className="vspace-2">
            <Label>Anstrengung (1 = sehr leicht, 10 = maximal)</Label>
            <div className="flex gap-1" role="radiogroup" aria-label="Anstrengung">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={effort === n}
                  onClick={() => setEffort(n)}
                  className={cn('h-9 flex-1 rounded-md border text-sm font-medium transition-colors',
                    effort === n ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
                >{n}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pain} onChange={e => setPain(e.target.checked)} />
            Beschwerden (z. B. Schmerzen, Zwicken)
          </label>
          <div className="vspace-1">
            <Label htmlFor="fb-notes">Notiz (optional)</Label>
            <Textarea
              id="fb-notes" rows={2} maxLength={2000} value={notes}
              onChange={e => setNotes(e.target.value)} placeholder="z. B. Wade zwickt, sehr warm …"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => void submit(true)}>Überspringen</Button>
          <Button disabled={busy || effort === null} onClick={() => void submit(false)}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
