import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import { today } from '@/lib/today'
import { emitDataChanged } from '@/lib/dataEvents'
import { parseCoachChanges, type ChangeItem } from '@/lib/coachChanges'
import { cn } from '@/lib/utils'

export function ChangeReview({ initialText }: { initialText?: string } = {}) {
  const [text, setText] = useState(initialText ?? '')
  const [planId, setPlanId] = useState<number | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [items, setItems] = useState<ChangeItem[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => { setItems(null); setSummary(null); setPlanId(null); setSelected(new Set()) }

  const preview = async (source: string = text) => {
    setError(null); setSuccess(null); reset(); setBusy(true)
    try {
      const plans = await invoke(IPC.PLANS_LIST)
      const active = plans.find(p => p.isActive)
      if (!active) { setError('Es gibt keinen aktiven Trainingsplan. Aktiviere zuerst einen Plan unter „Plans“.'); return }
      const plan = await invoke(IPC.PLANS_GET, active.id)
      if (!plan) { setError('Der aktive Plan konnte nicht geladen werden.'); return }
      const res = parseCoachChanges(source, plan, today())
      setPlanId(plan.id)
      setSummary(res.summary)
      setItems(res.items)
      setSelected(new Set(res.items.filter(i => !i.error).map(i => i.index)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Die Antwort konnte nicht gelesen werden.')
    } finally {
      setBusy(false)
    }
  }

  // Vorbelegter Text (z. B. vom lokalen Coach): einsetzen und Vorschau automatisch starten
  useEffect(() => {
    if (!initialText?.trim()) return
    setText(initialText)
    void preview(initialText)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText])

  const toggle = (i: number) =>
    setSelected(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n })

  const apply = async () => {
    if (!items || planId == null) return
    const changes = items.filter(i => selected.has(i.index) && i.change).map(i => i.change!)
    if (changes.length === 0) return
    setBusy(true); setError(null)
    try {
      const { applied } = await invoke(IPC.COACH_APPLY_CHANGES, { planId, changes })
      setSuccess(`${applied} ${applied === 1 ? 'Änderung' : 'Änderungen'} übernommen`)
      setText(''); reset()
      emitDataChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Änderungen konnten nicht übernommen werden.')
    } finally {
      setBusy(false)
    }
  }

  const count = items ? items.filter(i => selected.has(i.index) && i.change).length : 0

  return (
    <div className="vspace-3">
      <p className="text-sm text-muted-foreground">
        Füge hier die Antwort von Claude ein (JSON mit Änderungen am Plan). Du siehst vorher, was sich ändern würde.
      </p>
      <Textarea rows={6} value={text} onChange={e => setText(e.target.value)} placeholder="Antwort von Claude hier einfügen…" className="font-mono text-xs" />
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => preview()} disabled={busy || !text.trim()}>Vorschau</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>}

      {items && (
        <div className="rounded-lg border bg-card p-4 vspace-3">
          {summary && <p className="text-sm">{summary}</p>}
          {items.length === 0 && <p className="text-sm text-muted-foreground">Die Antwort enthält keine Änderungen.</p>}
          <ul className="vspace-2">
            {items.map(it => (
              <li key={it.index} className={cn('flex gap-3 rounded-md border p-3', it.error ? 'border-red-500/40 bg-red-500/5' : 'bg-background')}>
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(it.index)}
                  disabled={!!it.error}
                  onChange={() => toggle(it.index)}
                  aria-label={`${it.title} übernehmen`}
                />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{it.title}</p>
                  {it.error ? (
                    <p className="text-red-600 dark:text-red-400">{it.error}</p>
                  ) : (
                    <p className="flex items-center gap-1.5 flex-wrap">
                      {it.before && <span className="line-through text-muted-foreground">{it.before}</span>}
                      {it.before && it.after && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      {it.after && <span>{it.after}</span>}
                    </p>
                  )}
                  {it.reason && <p className="text-xs text-muted-foreground mt-0.5">{it.reason}</p>}
                </div>
              </li>
            ))}
          </ul>
          <Button onClick={apply} disabled={busy || count === 0}>
            {count} {count === 1 ? 'Änderung' : 'Änderungen'} übernehmen
          </Button>
        </div>
      )}
    </div>
  )
}
