import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import { today } from '@/lib/today'
import { StartDateField, effectiveStart } from './StartDateField'
import { nextMonday } from './sessionFormat'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function EmptyPlanModal({ open, onClose, onSaved }: Props) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [goalEvent, setGoalEvent] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [start, setStart] = useState(() => nextMonday(today()))
  const [weeks, setWeeks] = useState('12')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName(''); setGoalEvent(''); setGoalDate('')
    setStart(nextMonday(today())); setWeeks('12'); setError(null)
  }
  const handleClose = () => { reset(); onClose() }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const startDate = effectiveStart(start)
    const weekCount = Number(weeks)
    if (!name.trim()) { setError('Bitte einen Namen eingeben.'); return }
    if (!startDate) { setError('Bitte ein Startdatum wählen.'); return }
    if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 52) {
      setError('Die Anzahl der Wochen muss zwischen 1 und 52 liegen.'); return
    }
    setSaving(true); setError(null)
    try {
      const plan = await invoke(IPC.PLANS_CREATE_EMPTY, {
        name: name.trim(),
        goalEvent: goalEvent.trim() || null,
        goalDate: goalDate || null,
        startDate,
        weekCount,
      })
      onSaved()
      reset()
      onClose()
      navigate(`/plan/${plan.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Leerer Plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="vspace-4">
          <div className="vspace-1">
            <Label htmlFor="ep-name">Name *</Label>
            <Input id="ep-name" placeholder="z. B. Halbmarathon 12 Wochen" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="vspace-1">
              <Label htmlFor="ep-event">Ziel-Event</Label>
              <Input id="ep-event" placeholder="z. B. Stadtlauf" value={goalEvent} onChange={e => setGoalEvent(e.target.value)} />
            </div>
            <div className="vspace-1">
              <Label htmlFor="ep-goal-date">Ziel-Datum</Label>
              <Input id="ep-goal-date" type="date" value={goalDate} onChange={e => setGoalDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StartDateField id="ep-start" value={start} onChange={setStart} />
            <div className="vspace-1">
              <Label htmlFor="ep-weeks">Anzahl Wochen (1–52) *</Label>
              <Input id="ep-weeks" type="number" min={1} max={52} value={weeks} onChange={e => setWeeks(e.target.value)} />
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>Abbrechen</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Wird angelegt …' : 'Plan anlegen'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
