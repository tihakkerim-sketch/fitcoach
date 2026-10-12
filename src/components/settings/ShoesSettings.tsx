import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { Shoe } from '@/types/ipc'

interface Form {
  id?: number
  name: string
  brand: string
  startKm: string
  maxKm: string
  isDefault: boolean
  retired: boolean
}

const emptyForm = (): Form => ({ name: '', brand: '', startKm: '0', maxKm: '700', isDefault: false, retired: false })

const fmt = (n: number) => n.toLocaleString('de-AT', { maximumFractionDigits: 1 })

export function ShoesSettings() {
  const [shoes, setShoes] = useState<Shoe[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const load = useCallback(() => {
    invoke(IPC.SHOES_LIST).then(setShoes).catch(() => {})
  }, [])
  useEffect(load, [load])

  const edit = (s: Shoe) => {
    setError(null)
    setForm({
      id: s.id, name: s.name, brand: s.brand ?? '', startKm: String(s.startKm),
      maxKm: String(s.maxKm), isDefault: s.isDefault, retired: s.retired,
    })
  }

  const save = async () => {
    if (!form) return
    const startKm = Number(form.startKm)
    const maxKm = Number(form.maxKm)
    if (!form.name.trim()) { setError('Bitte einen Namen eingeben.'); return }
    if (!Number.isFinite(startKm) || startKm < 0 || startKm > 5000) { setError('„km beim Start“ muss zwischen 0 und 5.000 liegen.'); return }
    if (!Number.isFinite(maxKm) || maxKm < 50 || maxKm > 5000) { setError('„Max. km“ muss zwischen 50 und 5.000 liegen.'); return }
    setBusy(true)
    setError(null)
    try {
      await invoke(IPC.SHOES_SAVE, {
        id: form.id, name: form.name.trim(), brand: form.brand.trim() || null,
        startKm, maxKm, retired: form.retired, isDefault: form.isDefault && !form.retired,
      })
      setForm(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    setBusy(true)
    try {
      await invoke(IPC.SHOES_DELETE, id)
      setConfirmId(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="vspace-3">
      <h2 className="font-semibold">Laufschuhe</h2>
      <Separator />
      <p className="text-xs text-muted-foreground">
        Neue Läufe bekommen automatisch den Standard-Schuh. So siehst du, wann ein Paar ersetzt werden sollte.
      </p>

      {shoes.length === 0 && !form && (
        <p className="text-sm text-muted-foreground">Noch kein Schuh angelegt.</p>
      )}

      <div className="vspace-2">
        {shoes.map(s => {
          const pct = s.maxKm > 0 ? (s.totalKm / s.maxKm) * 100 : 0
          const over = pct >= 100
          const soon = pct >= 80 && !over
          return (
            <div key={s.id} className={`rounded-lg border p-3 vspace-2 ${s.retired ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                    {s.name}
                    {s.brand && <span className="text-xs text-muted-foreground">{s.brand}</span>}
                    {s.isDefault && <span className="rounded bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5">Standard</span>}
                    {s.retired && <span className="rounded bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5">Ausgemustert</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmt(s.totalKm)} von {fmt(s.maxKm)} km · {s.runCount} {s.runCount === 1 ? 'Lauf' : 'Läufe'}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" aria-label={`${s.name} bearbeiten`} onClick={() => edit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={`${s.name} löschen`} onClick={() => setConfirmId(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full ${over ? 'bg-red-500' : soon ? 'bg-amber-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              {over && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Ersetzen empfohlen – höheres Verletzungsrisiko
                </p>
              )}
              {soon && <p className="text-xs text-amber-500">Bald ersetzen</p>}
              {confirmId === s.id && (
                <div className="rounded-md bg-muted p-2 text-xs flex items-center justify-between gap-2">
                  <span>„{s.name}“ wirklich löschen? Die Läufe bleiben erhalten, verlieren aber die Schuh-Zuordnung.</span>
                  <span className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}>Abbrechen</Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => remove(s.id)}>Löschen</Button>
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {form ? (
        <div className="rounded-lg border p-3 vspace-3">
          <h3 className="text-sm font-medium">{form.id ? 'Schuh bearbeiten' : 'Neuer Schuh'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="vspace-1">
              <Label htmlFor="shoe-name">Name</Label>
              <Input id="shoe-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="z. B. Pegasus 41" />
            </div>
            <div className="vspace-1">
              <Label htmlFor="shoe-brand">Marke</Label>
              <Input id="shoe-brand" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="z. B. Nike" />
            </div>
            <div className="vspace-1">
              <Label htmlFor="shoe-start">km beim Start</Label>
              <Input id="shoe-start" type="number" min={0} max={5000} value={form.startKm} onChange={e => setForm({ ...form, startKm: e.target.value })} />
            </div>
            <div className="vspace-1">
              <Label htmlFor="shoe-max">Max. km</Label>
              <Input id="shoe-max" type="number" min={50} max={5000} value={form.maxKm} onChange={e => setForm({ ...form, maxKm: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isDefault} disabled={form.retired} onChange={e => setForm({ ...form, isDefault: e.target.checked })} />
            Standard-Schuh für neue Läufe
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.retired} onChange={e => setForm({ ...form, retired: e.target.checked, isDefault: e.target.checked ? false : form.isDefault })} />
            Ausgemustert
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>Speichern</Button>
            <Button size="sm" variant="outline" onClick={() => { setForm(null); setError(null) }}>Abbrechen</Button>
          </div>
        </div>
      ) : (
        <>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setError(null); setForm({ ...emptyForm(), isDefault: shoes.length === 0 }) }}>
            <Plus className="h-3.5 w-3.5" /> Schuh hinzufügen
          </Button>
        </>
      )}
    </section>
  )
}
