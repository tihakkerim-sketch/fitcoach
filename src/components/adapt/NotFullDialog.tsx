import { useState } from 'react'
import { HeartPulse } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/contexts/ToastContext'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import { emitDataChanged } from '@/lib/dataEvents'
import { cn } from '@/lib/utils'

type Reason = 'sick' | 'pain' | 'busy'
const REASONS: { value: Reason; label: string }[] = [
  { value: 'sick', label: 'Krank' },
  { value: 'pain', label: 'Beschwerden' },
  { value: 'busy', label: 'Wenig Zeit' },
]

/** Knopf „Nicht 100 %“ + Dialog (Grund, Dauer) → Vorschlag. */
export function NotFullButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<Reason>('sick')
  const [days, setDays] = useState(2)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const create = async () => {
    setBusy(true)
    try {
      const p = await invoke(IPC.ADAPT_NOT_FULL, { reason, days })
      toast({
        message: p ? 'Vorschlag erstellt – du findest ihn oben als Karte.' : 'Keine geplanten Einheiten in diesem Zeitraum.',
        duration: 4000,
      })
      setOpen(false)
      emitDataChanged()
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Vorschlag konnte nicht erstellt werden.', duration: 5000 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="outline" className={className} onClick={() => setOpen(true)}>
        <HeartPulse className="h-4 w-4 mr-2" /> Nicht 100 %
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nicht 100 %?</DialogTitle></DialogHeader>
          <div className="vspace-4">
            <div className="vspace-2">
              <Label>Grund</Label>
              <div className="flex gap-2">
                {REASONS.map(r => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={cn('flex-1 rounded-md border px-3 py-2 text-sm',
                      reason === r.value ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
                  >{r.label}</button>
                ))}
              </div>
            </div>
            <div className="vspace-2">
              <Label htmlFor="nf-days">Dauer: {days} {days === 1 ? 'Tag' : 'Tage'} ab heute</Label>
              <input id="nf-days" type="range" min={1} max={7} value={days} onChange={e => setDays(Number(e.target.value))} className="w-full" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button disabled={busy} onClick={() => void create()}>Vorschlag erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
