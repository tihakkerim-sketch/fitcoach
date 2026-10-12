import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { UserProfile } from '@/types/ipc'
import { karvonenZones } from '@/shared/coach/zones'
import { setDayStartHour } from '@/lib/today'
import { EmptyPlanModal } from '@/components/plans/EmptyPlanModal'
import { ImportPlanModal } from '@/components/plans/ImportPlanModal'

const STEPS = ['Willkommen', 'Ziel', 'Puls-Zonen', 'Tageswechsel & Schuh', 'Trainingsplan']
const HOURS = [0, 1, 2, 3, 4, 5, 6]

interface Fields {
  name: string; age: string; maxHr: string; restingHr: string
  goalEvent: string; goalFinishTime: string; trainingDays: string; weeklyKm: string
  dayStartHour: number
  shoeName: string; shoeKm: string
}

/** Leer → undefined; sonst Zahl (NaN bleibt NaN, wird von der Prüfung abgefangen). */
const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))

function inRange(v: number | undefined, min: number, max: number, int = false): boolean {
  if (v === undefined) return true
  return Number.isFinite(v) && v >= min && v <= max && (!int || Number.isInteger(v))
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState<Partial<UserProfile> | null>(null)
  const [f, setF] = useState<Fields>({
    name: '', age: '', maxHr: '', restingHr: '', goalEvent: '', goalFinishTime: '',
    trainingDays: '', weeklyKm: '', dayStartHour: 4, shoeName: '', shoeKm: '0',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showEmpty, setShowEmpty] = useState(false)
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    invoke(IPC.PROFILE_GET).then(p => {
      if (!p) return
      setProfile(p)
      setF(prev => ({
        ...prev,
        name: p.name ?? '', age: p.age != null ? String(p.age) : '',
        maxHr: p.maxHr != null ? String(p.maxHr) : '', restingHr: p.restingHr != null ? String(p.restingHr) : '',
        goalEvent: p.goalEvent ?? '', goalFinishTime: p.goalFinishTime ?? '',
        trainingDays: p.trainingDaysPerWeek != null ? String(p.trainingDaysPerWeek) : '',
        weeklyKm: p.weeklyGoalKm != null ? String(p.weeklyGoalKm) : '',
        dayStartHour: p.dayStartHour ?? 4,
      }))
    }).catch(() => {})
  }, [])

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => { setF(p => ({ ...p, [k]: v })); setError(null) }

  const maxHr = num(f.maxHr)
  const restHr = num(f.restingHr)
  const age = num(f.age)
  const suggestedMax = age !== undefined && Number.isFinite(age) && age >= 5 && age <= 120 ? Math.round(220 - age) : null

  const zones = useMemo(() => {
    if (maxHr === undefined || !Number.isFinite(maxHr)) return []
    const rest = restHr !== undefined && Number.isFinite(restHr) ? restHr : 60
    return rest < maxHr ? karvonenZones(Math.round(maxHr), Math.round(rest)) : []
  }, [maxHr, restHr])

  /** Prüft den aktuellen Schritt; liefert Fehlermeldung oder null. */
  const validate = (s: number): string | null => {
    if (s === 0) {
      if (f.name.length > 200) return 'Der Name ist zu lang.'
      if (!inRange(age, 5, 120, true)) return 'Alter: bitte eine ganze Zahl zwischen 5 und 120 eingeben.'
      if (!inRange(maxHr, 100, 250, true)) return 'Max-Puls: bitte einen Wert zwischen 100 und 250 eingeben.'
      if (!inRange(restHr, 20, 250, true)) return 'Ruhepuls: bitte einen Wert zwischen 20 und 250 eingeben.'
      if (maxHr !== undefined && restHr !== undefined && restHr >= maxHr) return 'Der Ruhepuls muss kleiner als der Max-Puls sein.'
    }
    if (s === 1) {
      if (f.goalEvent.length > 200) return 'Der Wettkampf-Name ist zu lang.'
      if (f.goalFinishTime.length > 50) return 'Die Zielzeit ist zu lang.'
      if (!inRange(num(f.trainingDays), 1, 7, true)) return 'Trainingstage pro Woche: bitte 1 bis 7 eingeben.'
      if (!inRange(num(f.weeklyKm), 0, 2000)) return 'Wochenziel: bitte 0 bis 2.000 km eingeben.'
    }
    if (s === 3 && f.shoeName.trim()) {
      if (f.shoeName.length > 100) return 'Der Schuh-Name ist zu lang.'
      if (!inRange(num(f.shoeKm) ?? 0, 0, 5000)) return 'Schuh-km: bitte 0 bis 5.000 eingeben.'
    }
    return null
  }

  const saveProfile = async () => {
    // Vorhandenes Profil als Basis, nur Felder dieses Assistenten überschreiben
    const base = profile ?? {}
    await invoke(IPC.PROFILE_SAVE, {
      name: f.name.trim() || base.name,
      age: age ?? base.age,
      maxHr: maxHr ?? base.maxHr,
      restingHr: restHr ?? base.restingHr,
      goalEvent: f.goalEvent.trim() || base.goalEvent,
      goalFinishTime: f.goalFinishTime.trim() || base.goalFinishTime,
      trainingDaysPerWeek: num(f.trainingDays) ?? base.trainingDaysPerWeek,
      fixedRestDays: (base.fixedRestDays ?? []).map(d => (d === 0 ? 7 : d)).filter(d => d >= 1 && d <= 7),
      injuryNotes: base.injuryNotes,
      theme: base.theme ?? 'dark',
      weeklyGoalKm: num(f.weeklyKm) ?? base.weeklyGoalKm,
      weeklyGoalSessions: base.weeklyGoalSessions,
      dayStartHour: f.dayStartHour,
    })
    setDayStartHour(f.dayStartHour)
  }

  const finish = async (save: boolean) => {
    setBusy(true)
    setError(null)
    try {
      if (save) {
        const bad = [0, 1, 3].map(validate).find(Boolean)
        if (bad) { setError(bad); setBusy(false); return }
        await saveProfile()
        if (f.shoeName.trim()) {
          await invoke(IPC.SHOES_SAVE, {
            name: f.shoeName.trim(), startKm: num(f.shoeKm) ?? 0, maxKm: 700, retired: false, isDefault: true,
          })
        }
      }
      await invoke(IPC.ONBOARDING_COMPLETE)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das hat nicht geklappt. Bitte versuche es noch einmal.')
      setBusy(false)
    }
  }

  const next = () => {
    const err = validate(step)
    if (err) { setError(err); return }
    setError(null)
    setStep(s => s + 1)
  }

  return (
    <div className="p-6 max-w-xl mx-auto vspace-6">
      <div className="vspace-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Schritt {step + 1} von {STEPS.length}: {STEPS[step]}</span>
          <button type="button" className="underline hover:text-foreground" disabled={busy} onClick={() => finish(false)}>
            Überspringen
          </button>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
          <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      {step === 0 && (
        <section className="vspace-4">
          <h1 className="text-2xl font-bold">Willkommen bei FitCoach</h1>
          <p className="text-sm text-muted-foreground">Ein paar Angaben, damit die App für dich rechnen kann. Alles lässt sich später in den Einstellungen ändern.</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="vspace-1">
              <Label htmlFor="ob-name">Name</Label>
              <Input id="ob-name" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Dein Name" />
            </div>
            <div className="vspace-1">
              <Label htmlFor="ob-age">Alter</Label>
              <Input id="ob-age" type="number" min={5} max={120} value={f.age} onChange={e => set('age', e.target.value)} />
            </div>
            <div className="vspace-1">
              <Label htmlFor="ob-max">Max-Puls (bpm)</Label>
              <Input id="ob-max" type="number" min={100} max={250} value={f.maxHr} onChange={e => set('maxHr', e.target.value)} />
            </div>
            <div className="vspace-1">
              <Label htmlFor="ob-rest">Ruhepuls (bpm)</Label>
              <Input id="ob-rest" type="number" min={20} max={250} value={f.restingHr} onChange={e => set('restingHr', e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Max-Puls unbekannt? Als grobe Schätzung gilt 220 minus Alter
            {suggestedMax ? ` (bei dir etwa ${suggestedMax} bpm)` : ''}. Besser ist der höchste Puls bei einem harten Lauf.
          </p>
          {suggestedMax && !f.maxHr && (
            <Button type="button" variant="outline" size="sm" onClick={() => set('maxHr', String(suggestedMax))}>
              {suggestedMax} bpm übernehmen
            </Button>
          )}
        </section>
      )}

      {step === 1 && (
        <section className="vspace-4">
          <h1 className="text-2xl font-bold">Dein Ziel</h1>
          <div className="grid grid-cols-2 gap-4">
            <div className="vspace-1">
              <Label htmlFor="ob-event">Wettkampf / Ziel</Label>
              <Input id="ob-event" value={f.goalEvent} onChange={e => set('goalEvent', e.target.value)} placeholder="z. B. Stadtmarathon" />
            </div>
            <div className="vspace-1">
              <Label htmlFor="ob-time">Zielzeit</Label>
              <Input id="ob-time" value={f.goalFinishTime} onChange={e => set('goalFinishTime', e.target.value)} placeholder="z. B. 1:45:00" />
            </div>
            <div className="vspace-1">
              <Label htmlFor="ob-days">Trainingstage pro Woche</Label>
              <Input id="ob-days" type="number" min={1} max={7} value={f.trainingDays} onChange={e => set('trainingDays', e.target.value)} />
            </div>
            <div className="vspace-1">
              <Label htmlFor="ob-km">Wochenziel (km)</Label>
              <Input id="ob-km" type="number" min={0} max={2000} step={0.5} value={f.weeklyKm} onChange={e => set('weeklyKm', e.target.value)} placeholder="z. B. 40" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Alles optional. Du kannst Felder leer lassen.</p>
        </section>
      )}

      {step === 2 && (
        <section className="vspace-4">
          <h1 className="text-2xl font-bold">Puls-Zonen</h1>
          <p className="text-sm text-muted-foreground">
            Zonen zeigen, wie hart ein Lauf war. Sie werden automatisch aus deinem Max- und Ruhepuls berechnet.
          </p>
          {zones.length > 0 ? (
            <div className="rounded-lg border divide-y">
              {zones.map(z => (
                <div key={z.zoneNumber} className="flex justify-between px-3 py-2 text-sm">
                  <span>Zone {z.zoneNumber} · {z.label}</span>
                  <span className="text-muted-foreground">{z.minHr}–{z.maxHr} bpm</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ohne Max-Puls gibt es noch keine Vorschau. Gehe zurück und trage ihn ein, oder lass es für später.
            </p>
          )}
          <p className="text-xs text-muted-foreground">Kannst du später in den Einstellungen anpassen.</p>
        </section>
      )}

      {step === 3 && (
        <section className="vspace-4">
          <h1 className="text-2xl font-bold">Tageswechsel & Laufschuh</h1>
          <div className="vspace-2">
            <Label htmlFor="ob-day">Neuer Tag beginnt um</Label>
            <select
              id="ob-day"
              value={f.dayStartHour}
              onChange={e => set('dayStartHour', Number(e.target.value))}
              className="h-9 rounded-md border bg-background px-2 text-sm block"
            >
              {HOURS.map(h => <option key={h} value={h}>{h} Uhr</option>)}
            </select>
            <p className="text-xs text-muted-foreground">
              Einträge bis zu dieser Uhrzeit zählen noch zum Vortag – praktisch, wenn du spät schlafen gehst.
            </p>
          </div>
          <div className="vspace-2">
            <h2 className="font-semibold text-sm">Erster Laufschuh (optional)</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="vspace-1">
                <Label htmlFor="ob-shoe">Name</Label>
                <Input id="ob-shoe" value={f.shoeName} onChange={e => set('shoeName', e.target.value)} placeholder="z. B. Pegasus 41" />
              </div>
              <div className="vspace-1">
                <Label htmlFor="ob-shoekm">km bisher</Label>
                <Input id="ob-shoekm" type="number" min={0} max={5000} value={f.shoeKm} onChange={e => set('shoeKm', e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Neue Läufe bekommen automatisch diesen Standard-Schuh.</p>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="vspace-4">
          <h1 className="text-2xl font-bold">Trainingsplan</h1>
          <p className="text-sm text-muted-foreground">Lege jetzt einen Plan an oder mach das später im Bereich „Pläne“.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowEmpty(true)}>Leeren Plan anlegen</Button>
            <Button variant="outline" onClick={() => setShowImport(true)}>Plan von Claude importieren</Button>
            <Button variant="ghost" disabled={busy} onClick={() => finish(true)}>Später</Button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-red-500" role="alert">{error}</p>}

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 0 || busy} onClick={() => { setError(null); setStep(s => s - 1) }}>Zurück</Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>Weiter</Button>
        ) : (
          <Button disabled={busy} onClick={() => finish(true)}>Fertig</Button>
        )}
      </div>

      {/* Plan erst nach dem Speichern von Profil/Schuh anlegen, dann Assistent abschließen */}
      <EmptyPlanModal
        open={showEmpty}
        onClose={() => setShowEmpty(false)}
        onSaved={() => { setShowEmpty(false); void finishQuiet() }}
      />
      <ImportPlanModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onSaved={() => { setShowImport(false); void finishQuiet() }}
      />
    </div>
  )

  // Nach angelegtem Plan: Profil/Schuh speichern und Assistent abschließen, ohne zu navigieren
  // (die Plan-Modale navigieren selbst zum neuen Plan).
  async function finishQuiet() {
    try {
      if (!validate(0) && !validate(1) && !validate(3)) {
        await saveProfile()
        if (f.shoeName.trim()) {
          await invoke(IPC.SHOES_SAVE, {
            name: f.shoeName.trim(), startKm: num(f.shoeKm) ?? 0, maxKm: 700, retired: false, isDefault: true,
          })
        }
      }
      await invoke(IPC.ONBOARDING_COMPLETE)
    } catch {
      // Plan ist angelegt; Einrichtung kann bei Bedarf erneut gestartet werden
    }
  }
}
