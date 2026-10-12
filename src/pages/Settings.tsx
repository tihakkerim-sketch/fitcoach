import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Sun, Moon, Monitor, Power, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { UserProfile } from '@/types/ipc'
import { useTheme } from '@/contexts/ThemeContext'
import { IntervalsSettings } from '@/components/settings/IntervalsSettings'
import { HrZonesSettings } from '@/components/settings/HrZonesSettings'
import { ShoesSettings } from '@/components/settings/ShoesSettings'
import { setDayStartHour } from '@/lib/today'

// 1=Mo … 7=So (wie im Vertrag und in den Plänen)
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const HOURS = [0, 1, 2, 3, 4, 5, 6]

export default function Settings() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [profile, setProfile] = useState<Partial<UserProfile>>({ theme: 'dark' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [restDays, setRestDays] = useState<number[]>([])
  const [autostart, setAutostart] = useState(false)
  const [autostartBusy, setAutostartBusy] = useState(false)

  useEffect(() => {
    invoke(IPC.PROFILE_GET).then(p => {
      if (p) {
        setProfile(p)
        // Alte Werte mit 0 (= Sonntag) auf 7 abbilden
        setRestDays([...new Set((p.fixedRestDays ?? []).map(d => d === 0 ? 7 : d))].filter(d => d >= 1 && d <= 7))
      }
    }).catch(() => {})

    invoke(IPC.AUTOSTART_GET)
      .then(setAutostart)
      .catch(() => {})
  }, [])

  // Autostart is an OS-level setting, so apply it immediately on toggle rather
  // than waiting for the "Save Settings" button. Reflect the value the OS
  // actually reports back, in case the change was rejected.
  const toggleAutostart = async () => {
    if (autostartBusy) return
    const next = !autostart
    setAutostartBusy(true)
    try {
      const applied = await invoke(IPC.AUTOSTART_SET, next)
      setAutostart(applied)
    } catch {
      // leave the toggle in its previous state on failure
    } finally {
      setAutostartBusy(false)
    }
  }

  const set = (field: keyof UserProfile, value: unknown) =>
    setProfile(p => ({ ...p, [field]: value }))

  const toggleRestDay = (day: number) =>
    setRestDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Partial<UserProfile> = { ...profile, fixedRestDays: restDays, theme }
      await invoke(IPC.PROFILE_SAVE, payload)
      setDayStartHour(payload.dayStartHour ?? 4)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl vspace-8">
      <h1 className="text-2xl font-bold">Einstellungen</h1>

      {/* Darstellung */}
      <section className="vspace-3">
        <h2 className="font-semibold">Darstellung</h2>
        <Separator />
        <div className="flex items-center gap-3">
          <Label>Farbschema</Label>
          <div className="flex gap-2">
            {([
              { value: 'light',  label: 'Hell',   Icon: Sun     },
              { value: 'dark',   label: 'Dunkel', Icon: Moon    },
              { value: 'system', label: 'System', Icon: Monitor },
            ] as const).map(({ value, label, Icon }) => (
              <Button
                key={value}
                variant={theme === value ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => { setTheme(value); set('theme', value) }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          „System“ übernimmt automatisch die Hell/Dunkel-Einstellung von Windows.
        </p>
      </section>

      {/* Autostart */}
      <section className="vspace-3">
        <h2 className="font-semibold">Autostart</h2>
        <Separator />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Power className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label>FitCoach beim Anmelden starten</Label>
              <p className="text-xs text-muted-foreground">
                Startet die App automatisch, sobald du dich bei Windows anmeldest.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autostart}
            aria-label="FitCoach beim Anmelden starten"
            disabled={autostartBusy}
            onClick={toggleAutostart}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              autostart ? 'bg-primary' : 'bg-input'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-background shadow-sm transition-transform ${
                autostart ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </section>

      {/* intervals.icu */}
      <IntervalsSettings />

      {/* Profile */}
      <section className="vspace-3">
        <h2 className="font-semibold">Sportler-Profil</h2>
        <Separator />
        <div className="grid grid-cols-2 gap-4">
          <div className="vspace-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={profile.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Dein Name" />
          </div>
          <div className="vspace-1">
            <Label htmlFor="age">Alter</Label>
            <Input id="age" type="number" min={10} max={100} value={profile.age ?? ''} onChange={e => set('age', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="vspace-1">
            <Label htmlFor="max-hr">Max-Puls (bpm)</Label>
            <Input id="max-hr" type="number" min={100} max={250} value={profile.maxHr ?? ''} onChange={e => set('maxHr', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="vspace-1">
            <Label htmlFor="resting-hr">Ruhepuls (bpm)</Label>
            <Input id="resting-hr" type="number" min={30} max={120} value={profile.restingHr ?? ''} onChange={e => set('restingHr', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="vspace-1">
            <Label htmlFor="goal-event">Wettkampf / Ziel</Label>
            <Input id="goal-event" value={profile.goalEvent ?? ''} onChange={e => set('goalEvent', e.target.value)} placeholder="z. B. Stadtmarathon" />
          </div>
          <div className="vspace-1">
            <Label htmlFor="goal-time">Zielzeit</Label>
            <Input id="goal-time" value={profile.goalFinishTime ?? ''} onChange={e => set('goalFinishTime', e.target.value)} placeholder="z. B. 1:45:00" />
          </div>
          <div className="vspace-1">
            <Label htmlFor="training-days">Trainingstage pro Woche</Label>
            <Input id="training-days" type="number" min={1} max={7} value={profile.trainingDaysPerWeek ?? ''} onChange={e => set('trainingDaysPerWeek', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
        </div>

        <div className="vspace-2">
          <Label>Feste Ruhetage</Label>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleRestDay(i + 1)}
                className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                  restDays.includes(i + 1)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card hover:bg-muted'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="vspace-1">
          <Label htmlFor="injury-notes">Verletzungen / Gesundheit</Label>
          <Textarea
            id="injury-notes"
            rows={3}
            value={profile.injuryNotes ?? ''}
            onChange={e => set('injuryNotes', e.target.value)}
            placeholder="Verletzungen, Einschränkungen oder andere Hinweise …"
          />
        </div>
      </section>

      {/* Tageswechsel */}
      <section className="vspace-3">
        <h2 className="font-semibold">Tageswechsel</h2>
        <Separator />
        <div className="flex items-center gap-3">
          <Label htmlFor="day-start">Neuer Tag beginnt um</Label>
          <select
            id="day-start"
            value={profile.dayStartHour ?? 4}
            onChange={e => set('dayStartHour', Number(e.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {HOURS.map(h => <option key={h} value={h}>{h} Uhr</option>)}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          Einträge bis zu dieser Uhrzeit zählen noch zum Vortag – praktisch, wenn du spät schlafen gehst. Gilt nach dem Speichern.
        </p>
      </section>

      <HrZonesSettings />

      <ShoesSettings />

      {/* Wochenziele */}
      <section className="vspace-3">
        <h2 className="font-semibold">Wochenziele</h2>
        <Separator />
        <p className="text-xs text-muted-foreground">
          Setze Wochenziele, um deinen Fortschritt auf der Startseite zu sehen. Leer lassen, um die Zielanzeige auszublenden.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="vspace-1">
            <Label htmlFor="goal-km">Laufdistanz (km)</Label>
            <Input
              id="goal-km"
              type="number"
              min={0}
              max={500}
              step={0.5}
              placeholder="z. B. 40"
              value={profile.weeklyGoalKm ?? ''}
              onChange={e => set('weeklyGoalKm', e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div className="vspace-1">
            <Label htmlFor="goal-sessions">Trainingseinheiten</Label>
            <Input
              id="goal-sessions"
              type="number"
              min={0}
              max={14}
              placeholder="z. B. 5"
              value={profile.weeklyGoalSessions ?? ''}
              onChange={e => set('weeklyGoalSessions', e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
        </div>
      </section>

      <section className="vspace-3">
        <h2 className="font-semibold">Einrichtung</h2>
        <Separator />
        <p className="text-xs text-muted-foreground">Den Willkommens-Assistenten noch einmal durchgehen. Deine Daten bleiben erhalten.</p>
        <Button variant="outline" className="gap-1.5" onClick={() => navigate('/willkommen')}>
          <RotateCcw className="h-4 w-4" /> Einrichtung erneut starten
        </Button>
      </section>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saved ? <><Check className="h-4 w-4 mr-2" /> Gespeichert</> : saving ? 'Speichern …' : 'Einstellungen speichern'}
      </Button>
    </div>
  )
}
