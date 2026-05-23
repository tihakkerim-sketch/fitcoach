import { useState, useEffect, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import {
  Plus, Trash2, ChevronLeft, ChevronRight,
  Flame, Beef, Droplets, AlertCircle, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { NutritionLogEntry, CreateNutritionLogPayload, UserProfile, NutritionLabel } from '@/types/ipc'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const MEAL_LABELS: NutritionLabel[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Water', 'Other']

const LABEL_EMOJI: Record<string, string> = {
  Breakfast: '🍳',
  Lunch:     '🥗',
  Dinner:    '🍽️',
  Snack:     '🍎',
  Water:     '💧',
  Other:     '📝',
}

const WATER_QUICK: { label: string; ml: number }[] = [
  { label: '250 ml', ml: 250  },
  { label: '500 ml', ml: 500  },
  { label: '750 ml', ml: 750  },
  { label: '1 L',    ml: 1000 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function mlToDisplay(ml: number): string {
  return ml >= 1000
    ? `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1)} L`
    : `${ml} ml`
}

function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

function sumEntries(entries: NutritionLogEntry[]) {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories ?? 0),
      proteinG: acc.proteinG + (e.proteinG ?? 0),
      waterMl:  acc.waterMl  + (e.waterMl  ?? 0),
    }),
    { calories: 0, proteinG: 0, waterMl: 0 },
  )
}

// ── Macro progress bar ────────────────────────────────────────────────────────

function MacroBar({
  icon: Icon, label, value, target, unit, barColor,
}: {
  icon: React.ElementType
  label: string
  value: number
  target?: number
  unit: string
  barColor: string
}) {
  const pct  = target && target > 0 ? Math.min(Math.round((value / target) * 100), 100) : 0
  const done = target ? value >= target : false

  const displayValue = unit === 'water' ? mlToDisplay(value) : `${Math.round(value)} ${unit}`
  const displayTarget = target
    ? unit === 'water' ? `/ ${mlToDisplay(target)}` : `/ ${target} ${unit}`
    : ''

  return (
    <div className={cn('rounded-xl border bg-card p-4 flex-1', done && 'border-green-500/30')}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', barColor)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex-1">{label}</span>
        {done && <span className="text-[10px] font-bold text-green-500">GOAL ✓</span>}
      </div>
      <p className="text-2xl font-bold tabular-nums leading-none">{displayValue}</p>
      {target && <p className="text-xs text-muted-foreground mt-0.5">{displayTarget}</p>}
      {target && (
        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', done ? 'bg-green-500' : barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

// ── Log entry row ─────────────────────────────────────────────────────────────

function LogRow({
  entry, onDelete,
}: {
  entry: NutritionLogEntry
  onDelete: (id: number) => void
}) {
  const [confirming, setConfirming] = useState(false)

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
    } else {
      onDelete(entry.id)
    }
  }

  const emoji = LABEL_EMOJI[entry.label ?? ''] ?? '📝'
  const parts: string[] = []
  if (entry.calories) parts.push(`${entry.calories} kcal`)
  if (entry.proteinG) parts.push(`${entry.proteinG}g protein`)
  if (entry.waterMl)  parts.push(mlToDisplay(entry.waterMl))

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-lg leading-none select-none shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{entry.label ?? 'Entry'}</p>
        {parts.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">{parts.join(' · ')}</p>
        )}
        {entry.note && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 italic truncate">{entry.note}</p>
        )}
      </div>
      <button
        type="button"
        onClick={handleDelete}
        className={cn(
          'shrink-0 rounded-lg px-2 py-1 text-xs font-medium transition-all',
          confirming
            ? 'bg-destructive/10 text-destructive'
            : 'text-muted-foreground/30 hover:text-destructive',
        )}
        title={confirming ? 'Click again to confirm' : 'Delete entry'}
      >
        {confirming ? 'Delete?' : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

// ── Add entry form ────────────────────────────────────────────────────────────

function AddEntryForm({
  date, onSaved, onClose,
}: {
  date: string
  onSaved: () => void
  onClose: () => void
}) {
  const [label,    setLabel]    = useState<NutritionLabel>('Breakfast')
  const [calories, setCalories] = useState('')
  const [protein,  setProtein]  = useState('')
  const [waterMl,  setWaterMl]  = useState('')
  const [note,     setNote]     = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const save = async () => {
    const payload: CreateNutritionLogPayload = {
      date,
      label,
      calories:  calories  ? Math.round(Number(calories))  : undefined,
      proteinG:  protein   ? Number(protein)               : undefined,
      waterMl:   waterMl   ? Math.round(Number(waterMl))   : undefined,
      note:      note.trim() || undefined,
    }

    // Need at least one value
    if (!payload.calories && !payload.proteinG && !payload.waterMl) {
      setError('Enter at least calories, protein, or water.')
      return
    }

    setSaving(true); setError(null)
    try {
      await invoke(IPC.NUTRITION_LOG_CREATE, payload)
      onSaved()
      onClose()
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-border/60 p-4 space-y-4">
      {/* Meal label picker */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">Meal type</p>
        <div className="flex flex-wrap gap-1.5">
          {MEAL_LABELS.map(l => (
            <button
              key={l}
              type="button"
              onClick={() => setLabel(l)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                label === l
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              <span>{LABEL_EMOJI[l]}</span> {l}
            </button>
          ))}
        </div>
      </div>

      {/* Macro inputs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor="nut-calories" className="text-xs">Calories (kcal)</Label>
          <Input
            id="nut-calories"
            type="number"
            min={0}
            max={5000}
            placeholder="e.g. 420"
            value={calories}
            onChange={e => { setCalories(e.target.value); setError(null) }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="nut-protein" className="text-xs">Protein (g)</Label>
          <Input
            id="nut-protein"
            type="number"
            min={0}
            max={500}
            step={0.1}
            placeholder="e.g. 35"
            value={protein}
            onChange={e => { setProtein(e.target.value); setError(null) }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="nut-water" className="text-xs">Water (ml)</Label>
          <Input
            id="nut-water"
            type="number"
            min={0}
            max={5000}
            step={50}
            placeholder="e.g. 500"
            value={waterMl}
            onChange={e => { setWaterMl(e.target.value); setError(null) }}
          />
        </div>
      </div>

      {/* Optional note */}
      <div className="space-y-1">
        <Label htmlFor="nut-note" className="text-xs">Note (optional)</Label>
        <Input
          id="nut-note"
          placeholder="e.g. Post-run shake, homemade"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Add entry'}
        </Button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Nutrition() {
  const [date,      setDate]      = useState(todayStr())
  const [entries,   setEntries]   = useState<NutritionLogEntry[]>([])
  const [profile,   setProfile]   = useState<UserProfile | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [quickSaving, setQuickSaving] = useState(false)

  const isToday = date === todayStr()

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadEntries = useCallback(async () => {
    try {
      const data = await invoke<NutritionLogEntry[]>(IPC.NUTRITION_LOGS_GET, {
        dateFrom: date,
        dateTo:   date,
      })
      setEntries(data)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [date])

  const loadProfile = useCallback(async () => {
    try {
      const p = await invoke<UserProfile | null>(IPC.PROFILE_GET)
      setProfile(p)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { setLoading(true); loadEntries() }, [loadEntries])
  useEffect(() => { loadProfile() }, [loadProfile])

  // ── Quick-add water ─────────────────────────────────────────────────────────

  const quickAddWater = async (ml: number) => {
    if (quickSaving) return
    setQuickSaving(true)
    try {
      await invoke(IPC.NUTRITION_LOG_CREATE, {
        date,
        label:   'Water',
        waterMl: ml,
      } satisfies CreateNutritionLogPayload)
      await loadEntries()
    } catch { /* silent */ } finally {
      setQuickSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async (id: number) => {
    setEntries(prev => prev.filter(e => e.id !== id))
    try {
      await invoke(IPC.NUTRITION_LOG_DELETE, id)
    } catch {
      await loadEntries()   // rollback on error
    }
  }

  // ── Totals ──────────────────────────────────────────────────────────────────

  const totals = sumEntries(entries)
  const targets = {
    calories: profile?.dailyCalorieTarget,
    proteinG: profile?.dailyProteinTargetG,
    waterMl:  profile?.dailyWaterTargetMl,
  }

  const noTargets = !targets.calories && !targets.proteinG && !targets.waterMl

  const dateLabel = isToday
    ? 'Today'
    : format(new Date(date + 'T12:00:00'), 'EEE, MMM d')

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-8 max-w-2xl">

      {/* ── Header + date nav ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Nutrition</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDate(format(subDays(new Date(date + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold w-28 text-center">{dateLabel}</span>
          <button
            onClick={() => setDate(format(addDays(new Date(date + 'T12:00:00'), 1), 'yyyy-MM-dd'))}
            disabled={isToday}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── No-targets nudge ──────────────────────────────────────────── */}
      {noTargets && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-3 text-sm text-muted-foreground">
          Set daily targets in <strong className="text-foreground font-semibold">Settings → Nutrition</strong> to see progress bars.
        </div>
      )}

      {/* ── Macro summary ─────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <MacroBar
          icon={Flame}
          label="Calories"
          value={totals.calories}
          target={targets.calories}
          unit="kcal"
          barColor="bg-orange-500"
        />
        <MacroBar
          icon={Beef}
          label="Protein"
          value={totals.proteinG}
          target={targets.proteinG}
          unit="g"
          barColor="bg-blue-500"
        />
        <MacroBar
          icon={Droplets}
          label="Water"
          value={totals.waterMl}
          target={targets.waterMl}
          unit="water"
          barColor="bg-cyan-500"
        />
      </div>

      {/* ── Quick-add water ────────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
          Quick add water
        </p>
        <div className="flex gap-2">
          {WATER_QUICK.map(({ label, ml }) => (
            <button
              key={ml}
              type="button"
              onClick={() => quickAddWater(ml)}
              disabled={quickSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border bg-card text-sm font-medium hover:bg-cyan-500/10 hover:border-cyan-500/40 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all disabled:opacity-50"
            >
              <Droplets className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Today's log ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {dateLabel}'s log
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowForm(v => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            {showForm ? 'Cancel' : 'Add entry'}
          </Button>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Add form */}
          {showForm && (
            <AddEntryForm
              date={date}
              onSaved={loadEntries}
              onClose={() => setShowForm(false)}
            />
          )}

          {/* Entries */}
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : entries.length > 0 ? (
            <div className="divide-y divide-border/60">
              {entries.map(e => (
                <LogRow key={e.id} entry={e} onDelete={handleDelete} />
              ))}
              {/* Daily total footer */}
              <div className="px-4 py-3 bg-muted/30 flex items-center gap-4 text-xs font-semibold text-muted-foreground">
                <span className="flex-1">Daily total</span>
                {totals.calories > 0 && (
                  <span className="flex items-center gap-1 text-orange-500">
                    <Flame className="h-3 w-3" /> {Math.round(totals.calories)} kcal
                  </span>
                )}
                {totals.proteinG > 0 && (
                  <span className="flex items-center gap-1 text-blue-500">
                    <Beef className="h-3 w-3" /> {Math.round(totals.proteinG)}g
                  </span>
                )}
                {totals.waterMl > 0 && (
                  <span className="flex items-center gap-1 text-cyan-500">
                    <Droplets className="h-3 w-3" /> {mlToDisplay(totals.waterMl)}
                  </span>
                )}
              </div>
            </div>
          ) : !showForm ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground space-y-1">
              <p className="text-2xl">🍽️</p>
              <p>No entries yet{isToday ? ' today' : ' on this day'}.</p>
              <p className="text-xs">Use the quick-add buttons or tap "Add entry".</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
