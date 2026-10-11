import { useCallback, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { CoachStatus, ZoneDef } from '@/shared/coach'
import { karvonenZones } from '@/shared/coach'
import { onDataChanged } from '@/lib/dataEvents'

type Row = { zoneNumber: number; label: string; minHr: string; maxHr: string }

const toRows = (zones: ZoneDef[]): Row[] =>
  zones.map(z => ({ zoneNumber: z.zoneNumber, label: z.label, minHr: String(z.minHr), maxHr: String(z.maxHr) }))

/** Prüft Zonen; liefert deutsche Fehlermeldung oder null. */
function validate(rows: Row[]): string | null {
  let prevMax = -1
  for (const r of rows) {
    const min = Number(r.minHr)
    const max = Number(r.maxHr)
    if (r.minHr === '' || r.maxHr === '' || !Number.isFinite(min) || !Number.isFinite(max)) {
      return `Zone ${r.zoneNumber}: Bitte „von“ und „bis“ ausfüllen.`
    }
    if (min >= max) return `Zone ${r.zoneNumber}: „von“ muss kleiner als „bis“ sein.`
    if (min <= prevMax) return `Zone ${r.zoneNumber}: überlappt mit der Zone davor – Zonen müssen aufsteigend sein.`
    prevMax = max
  }
  return null
}

export function HrZonesSettings() {
  const [rows, setRows] = useState<Row[]>([])
  const [status, setStatus] = useState<CoachStatus | null>(null)
  const [maxHr, setMaxHr] = useState<number | null>(null)
  const [restHr, setRestHr] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [st, profile] = await Promise.all([invoke(IPC.COACH_STATUS), invoke(IPC.PROFILE_GET)])
      setStatus(st)
      setMaxHr(profile?.maxHr ?? null)
      setRestHr(profile?.restingHr ?? null)
      setRows(toRows(st.zones))
    } catch { /* Abschnitt bleibt leer */ }
  }, [])

  useEffect(() => { void load(); return onDataChanged(() => { void load() }) }, [load])

  const setCell = (i: number, key: 'minHr' | 'maxHr', v: string) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)))

  const compute = () => {
    const max = maxHr ?? status?.hr?.maxHr ?? null
    const rest = restHr ?? status?.hr?.restHr ?? null
    if (!max || !rest || rest >= max) {
      setError('Max- und Ruhepuls fehlen oder passen nicht zusammen. Trage sie oben im Athletenprofil ein und speichere.')
      return
    }
    setError(null); setSaved(false)
    setRows(toRows(karvonenZones(max, rest)))
  }

  const save = async () => {
    const err = validate(rows)
    if (err) { setError(err); return }
    setBusy(true); setError(null)
    try {
      await invoke(IPC.HR_ZONES_SAVE, rows.map(r => ({
        zoneNumber: r.zoneNumber, label: r.label, minHr: Number(r.minHr), maxHr: Number(r.maxHr),
      })))
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
    } finally { setBusy(false) }
  }

  const reset = async () => {
    setBusy(true); setError(null)
    try {
      await invoke(IPC.HR_ZONES_SAVE, [])
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Zurücksetzen fehlgeschlagen')
    } finally { setBusy(false) }
  }

  const source = !status ? null
    : status.zonesSource === 'saved' ? 'Eigene Zonen gespeichert'
    : status.zonesSource === 'computed' && status.hr ? `Automatisch berechnet aus Max ${status.hr.maxHr} / Ruhe ${status.hr.restHr}`
    : 'Noch keine Zonen – Max- und Ruhepuls im Profil eintragen oder Zonen von Hand setzen.'

  return (
    <section className="vspace-3">
      <h2 className="font-semibold">Puls-Zonen</h2>
      <Separator />
      {source && <p className="text-xs text-muted-foreground">{source}</p>}
      <p className="text-xs text-muted-foreground">
        Karvonen-Methode: Die Zonen richten sich nach der Reserve zwischen Ruhe- und Maximalpuls (50 %, 60 %, 70 %, 80 %, 90 % der Reserve).
      </p>

      {rows.length > 0 && (
        <div className="grid grid-cols-[3rem_1fr_6rem_6rem] gap-x-3 gap-y-2 items-center text-sm">
          <span className="text-xs text-muted-foreground">Zone</span>
          <span className="text-xs text-muted-foreground">Name</span>
          <span className="text-xs text-muted-foreground">von (bpm)</span>
          <span className="text-xs text-muted-foreground">bis (bpm)</span>
          {rows.map((r, i) => (
            <div key={r.zoneNumber} className="contents">
              <span className="font-medium">Z{r.zoneNumber}</span>
              <span>{r.label}</span>
              <Input type="number" min={0} max={300} value={r.minHr} aria-label={`Zone ${r.zoneNumber} von`} onChange={e => setCell(i, 'minHr', e.target.value)} />
              <Input type="number" min={0} max={300} value={r.maxHr} aria-label={`Zone ${r.zoneNumber} bis`} onChange={e => setCell(i, 'maxHr', e.target.value)} />
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={compute} disabled={busy}>Aus Max-/Ruhepuls berechnen</Button>
        <Button size="sm" onClick={save} disabled={busy || rows.length === 0}>
          {saved ? <><Check className="h-4 w-4 mr-1.5" /> Gespeichert</> : 'Speichern'}
        </Button>
        <Button variant="ghost" size="sm" onClick={reset} disabled={busy || status?.zonesSource !== 'saved'}>
          Zurücksetzen (automatisch)
        </Button>
      </div>
    </section>
  )
}
