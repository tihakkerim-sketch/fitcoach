import { useState, useEffect } from 'react'
import { Check, Sun, Moon, Monitor, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { UserProfile } from '@/types/ipc'
import { useTheme } from '@/contexts/ThemeContext'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const [profile, setProfile] = useState<Partial<UserProfile>>({ theme: 'dark' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [restDays, setRestDays] = useState<number[]>([])
  const [autostart, setAutostart] = useState(false)
  const [autostartBusy, setAutostartBusy] = useState(false)

  useEffect(() => {
    invoke<UserProfile | null>(IPC.PROFILE_GET).then(p => {
      if (p) {
        setProfile(p)
        setRestDays(p.fixedRestDays ?? [])
      }
    }).catch(() => {})

    invoke<boolean>(IPC.AUTOSTART_GET)
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
      const applied = await invoke<boolean>(IPC.AUTOSTART_SET, next)
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
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Appearance */}
      <section className="space-y-3">
        <h2 className="font-semibold">Appearance</h2>
        <Separator />
        <div className="flex items-center gap-3">
          <Label>Theme</Label>
          <div className="flex gap-2">
            {([
              { value: 'light',  label: 'Light',  Icon: Sun     },
              { value: 'dark',   label: 'Dark',   Icon: Moon    },
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
          "System" follows your operating system's light/dark preference automatically.
        </p>
      </section>

      {/* Startup */}
      <section className="space-y-3">
        <h2 className="font-semibold">Startup</h2>
        <Separator />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Power className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label>Launch FitCoach when I sign in</Label>
              <p className="text-xs text-muted-foreground">
                Starts the app automatically after Windows boots.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autostart}
            aria-label="Launch FitCoach when I sign in"
            disabled={autostartBusy}
            onClick={toggleAutostart}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              autostart ? 'bg-primary' : 'bg-input'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${
                autostart ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Profile */}
      <section className="space-y-3">
        <h2 className="font-semibold">Athlete Profile</h2>
        <Separator />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={profile.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Your name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="age">Age</Label>
            <Input id="age" type="number" min={10} max={100} value={profile.age ?? ''} onChange={e => set('age', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max-hr">Max HR (bpm)</Label>
            <Input id="max-hr" type="number" min={100} max={250} value={profile.maxHr ?? ''} onChange={e => set('maxHr', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="resting-hr">Resting HR (bpm)</Label>
            <Input id="resting-hr" type="number" min={30} max={120} value={profile.restingHr ?? ''} onChange={e => set('restingHr', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="goal-event">Goal event</Label>
            <Input id="goal-event" value={profile.goalEvent ?? ''} onChange={e => set('goalEvent', e.target.value)} placeholder="e.g. City Marathon" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="goal-time">Target finish time</Label>
            <Input id="goal-time" value={profile.goalFinishTime ?? ''} onChange={e => set('goalFinishTime', e.target.value)} placeholder="e.g. 1:45:00" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="training-days">Training days per week</Label>
            <Input id="training-days" type="number" min={1} max={7} value={profile.trainingDaysPerWeek ?? ''} onChange={e => set('trainingDaysPerWeek', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Fixed rest days</Label>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleRestDay(i)}
                className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                  restDays.includes(i)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card hover:bg-muted'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="injury-notes">Injury / health notes</Label>
          <Textarea
            id="injury-notes"
            rows={3}
            value={profile.injuryNotes ?? ''}
            onChange={e => set('injuryNotes', e.target.value)}
            placeholder="Any injuries, limitations, or health notes…"
          />
        </div>
      </section>

      {/* Weekly Goals */}
      <section className="space-y-3">
        <h2 className="font-semibold">Weekly Goals</h2>
        <Separator />
        <p className="text-xs text-muted-foreground">
          Set weekly targets to track progress on your Dashboard. Leave blank to hide the goal widget.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="goal-km">Running distance (km)</Label>
            <Input
              id="goal-km"
              type="number"
              min={0}
              max={500}
              step={0.5}
              placeholder="e.g. 40"
              value={profile.weeklyGoalKm ?? ''}
              onChange={e => set('weeklyGoalKm', e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="goal-sessions">Training sessions</Label>
            <Input
              id="goal-sessions"
              type="number"
              min={0}
              max={14}
              placeholder="e.g. 5"
              value={profile.weeklyGoalSessions ?? ''}
              onChange={e => set('weeklyGoalSessions', e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
        </div>
      </section>

      {/* Nutrition Targets */}
      <section className="space-y-3">
        <h2 className="font-semibold">Nutrition</h2>
        <Separator />
        <p className="text-xs text-muted-foreground">
          Daily targets shown as progress bars on the Nutrition page and Dashboard widget. Leave blank to track without a goal.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="cal-target">Calories (kcal)</Label>
            <Input
              id="cal-target"
              type="number"
              min={0}
              max={10000}
              step={50}
              placeholder="e.g. 2000"
              value={profile.dailyCalorieTarget ?? ''}
              onChange={e => set('dailyCalorieTarget', e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="protein-target">Protein (g)</Label>
            <Input
              id="protein-target"
              type="number"
              min={0}
              max={500}
              step={5}
              placeholder="e.g. 150"
              value={profile.dailyProteinTargetG ?? ''}
              onChange={e => set('dailyProteinTargetG', e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="water-target">Water (ml)</Label>
            <Input
              id="water-target"
              type="number"
              min={0}
              max={10000}
              step={250}
              placeholder="e.g. 2500"
              value={profile.dailyWaterTargetMl ?? ''}
              onChange={e => set('dailyWaterTargetMl', e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
        </div>
      </section>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saved ? <><Check className="h-4 w-4 mr-2" /> Saved</> : saving ? 'Saving…' : 'Save Settings'}
      </Button>
    </div>
  )
}
