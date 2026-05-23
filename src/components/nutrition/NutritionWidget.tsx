import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Flame, Beef, Droplets, ChevronRight } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { NutritionLogEntry, UserProfile } from '@/types/ipc'
import { cn } from '@/lib/utils'

function todayStr() { return format(new Date(), 'yyyy-MM-dd') }

function mlToDisplay(ml: number): string {
  return ml >= 1000
    ? `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1)} L`
    : `${ml} ml`
}

// ── Compact macro row ─────────────────────────────────────────────────────────

function MacroRow({
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

  const displayValue = unit === 'water'
    ? mlToDisplay(value)
    : `${Math.round(value)} ${unit}`

  const displayTarget = target
    ? unit === 'water' ? mlToDisplay(target) : `${target} ${unit}`
    : null

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Icon className={cn('h-3 w-3', barColor.replace('bg-', 'text-'))} />
          {label}
        </span>
        <span className={cn('tabular-nums font-semibold', done && 'text-green-500')}>
          {displayValue}
          {displayTarget && (
            <span className="font-normal text-muted-foreground"> / {displayTarget}</span>
          )}
        </span>
      </div>
      {target && (
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', done ? 'bg-green-500' : barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function NutritionWidget() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<NutritionLogEntry[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loaded,  setLoaded]  = useState(false)

  const today = todayStr()

  const load = useCallback(async () => {
    const [e, p] = await Promise.all([
      invoke<NutritionLogEntry[]>(IPC.NUTRITION_LOGS_GET, { dateFrom: today, dateTo: today }).catch(() => []),
      invoke<UserProfile | null>(IPC.PROFILE_GET).catch(() => null),
    ])
    setEntries(e)
    setProfile(p)
    setLoaded(true)
  }, [today])

  useEffect(() => { load() }, [load])

  if (!loaded) return null

  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories ?? 0),
      proteinG: acc.proteinG + (e.proteinG ?? 0),
      waterMl:  acc.waterMl  + (e.waterMl  ?? 0),
    }),
    { calories: 0, proteinG: 0, waterMl: 0 },
  )

  const hasTarget = !!(profile?.dailyCalorieTarget || profile?.dailyProteinTargetG || profile?.dailyWaterTargetMl)
  const hasData   = totals.calories > 0 || totals.proteinG > 0 || totals.waterMl > 0

  // Only render if there's data to show OR targets are set (so progress bars appear)
  if (!hasData && !hasTarget) return null

  return (
    <button
      onClick={() => navigate('/nutrition')}
      className="group w-full rounded-xl border bg-card p-4 text-left hover:shadow-md hover:scale-[1.005] transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Nutrition
        </p>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform" />
      </div>

      <div className="space-y-2">
        {(hasData || !!profile?.dailyCalorieTarget) && (
          <MacroRow
            icon={Flame}
            label="Calories"
            value={totals.calories}
            target={profile?.dailyCalorieTarget}
            unit="kcal"
            barColor="bg-orange-500"
          />
        )}
        {(hasData || !!profile?.dailyProteinTargetG) && (
          <MacroRow
            icon={Beef}
            label="Protein"
            value={totals.proteinG}
            target={profile?.dailyProteinTargetG}
            unit="g"
            barColor="bg-blue-500"
          />
        )}
        {(hasData || !!profile?.dailyWaterTargetMl) && (
          <MacroRow
            icon={Droplets}
            label="Water"
            value={totals.waterMl}
            target={profile?.dailyWaterTargetMl}
            unit="water"
            barColor="bg-cyan-500"
          />
        )}
      </div>
    </button>
  )
}
