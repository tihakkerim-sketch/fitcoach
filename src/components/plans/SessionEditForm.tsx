import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { SessionRow, SessionType, PlanBlock } from '@/types/ipc'
import { planStepsSchema, sessionTypeSchema } from '@/types/ipcContract'
import { formatPace, parsePaceRange } from '@/shared/planCalendar'
import { DOW_LONG, TYPE_LABEL } from './sessionFormat'

interface FormValues {
  title: string
  distance: string
  duration: string
  pace: string
  coachingNote: string
  steps: string
}

interface Props {
  plan: { id: number; weekCount: number }
  /** Vorhandene Einheit bearbeiten; ohne: neue Einheit an `initial` anlegen. */
  session: SessionRow | null
  initial: { weekIndex: number; dayOfWeek: number }
  onSaved: (s: SessionRow) => void
  onCancel: () => void
}

/** "8,5" oder "8.5" → 8.5; leer → null; ungültig → undefined */
function parseNum(s: string): number | null | undefined {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function paceToText(fast: number | null, slow: number | null): string {
  if (fast == null && slow == null) return ''
  const f = fast ?? slow as number
  const s = slow ?? fast as number
  return f === s ? formatPace(f) : `${formatPace(f)}-${formatPace(s)}`
}

export function SessionEditForm({ plan, session, initial, onSaved, onCancel }: Props) {
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      title: session?.title ?? '',
      distance: session?.targetDistanceKm != null ? String(session.targetDistanceKm).replace('.', ',') : '',
      duration: session?.targetDurationMin != null ? String(session.targetDurationMin) : '',
      pace: session ? paceToText(session.targetPaceFastSec, session.targetPaceSlowSec) : '',
      coachingNote: session?.coachingNote ?? '',
      steps: session?.steps && session.steps.length ? JSON.stringify(session.steps, null, 2) : '',
    },
  })
  const [weekIndex, setWeekIndex] = useState(session?.weekIndex ?? initial.weekIndex)
  const [dayOfWeek, setDayOfWeek] = useState(session?.dayOfWeek ?? initial.dayOfWeek)
  const [type, setType] = useState<SessionType>(session?.type ?? 'running')
  const [hrZone, setHrZone] = useState<string>(session?.targetHrZone != null ? String(session.targetHrZone) : '_none')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (v: FormValues) => {
    setError(null)

    const distance = parseNum(v.distance)
    if (distance === undefined) { setError('Distanz: bitte eine Zahl in km eingeben (z. B. 8,5).'); return }
    const duration = parseNum(v.duration)
    if (duration === undefined) { setError('Dauer: bitte eine Zahl in Minuten eingeben.'); return }

    let paceFast: number | null = null
    let paceSlow: number | null = null
    if (v.pace.trim()) {
      const range = parsePaceRange(v.pace.trim())
      if (!range) { setError('Pace ist ungültig. Format: 5:30 oder 5:30-5:50 (Minuten pro km, Sekunden unter 60).'); return }
      paceFast = range.fast
      paceSlow = range.slow
    }

    let steps: PlanBlock[] | null = null
    if (v.steps.trim()) {
      let raw: unknown
      try {
        raw = JSON.parse(v.steps)
      } catch {
        setError('Intervalle: kein gültiges JSON.')
        return
      }
      const checked = planStepsSchema.safeParse(raw)
      if (!checked.success) {
        const issue = checked.error.issues[0]
        const where = issue.path.length ? ` (${issue.path.join('.')})` : ''
        setError(`Intervalle: ${issue.message}${where}`)
        return
      }
      steps = checked.data
    }

    const fields = {
      dayOfWeek,
      type: sessionTypeSchema.parse(type),
      title: v.title.trim() || null,
      targetDistanceKm: distance,
      targetDurationMin: duration,
      targetPaceFastSec: paceFast,
      targetPaceSlowSec: paceSlow,
      targetHrZone: hrZone === '_none' ? null : Number(hrZone),
      steps,
      coachingNote: v.coachingNote.trim() || null,
    }

    setSaving(true)
    try {
      const saved = session
        ? await invoke(IPC.SESSIONS_UPDATE, { sessionId: session.id, weekIndex, ...fields })
        : await invoke(IPC.SESSIONS_CREATE, { planId: plan.id, weekIndex, ...fields })
      onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="vspace-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="vspace-1">
          <Label>Woche</Label>
          <Select value={String(weekIndex)} onValueChange={v => setWeekIndex(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: plan.weekCount }, (_, i) => (
                <SelectItem key={i} value={String(i)}>Woche {i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="vspace-1">
          <Label>Tag</Label>
          <Select value={String(dayOfWeek)} onValueChange={v => setDayOfWeek(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOW_LONG.map((d, i) => <SelectItem key={d} value={String(i + 1)}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="vspace-1">
          <Label>Typ</Label>
          <Select value={type} onValueChange={v => setType(v as SessionType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPE_LABEL) as SessionType[]).map(t => (
                <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="vspace-1">
        <Label htmlFor="se-title">Titel</Label>
        <Input id="se-title" placeholder="z. B. Lockerer Lauf" {...register('title')} />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="vspace-1">
          <Label htmlFor="se-dist">Distanz (km)</Label>
          <Input id="se-dist" inputMode="decimal" placeholder="8" {...register('distance')} />
        </div>
        <div className="vspace-1">
          <Label htmlFor="se-dur">Dauer (min)</Label>
          <Input id="se-dur" inputMode="decimal" placeholder="45" {...register('duration')} />
        </div>
        <div className="vspace-1">
          <Label htmlFor="se-pace">Pace (min/km)</Label>
          <Input id="se-pace" placeholder="5:30-5:50" {...register('pace')} />
        </div>
        <div className="vspace-1">
          <Label>HF-Zone</Label>
          <Select value={hrZone} onValueChange={setHrZone}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {[1, 2, 3, 4, 5].map(z => <SelectItem key={z} value={String(z)}>Z{z}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="vspace-1">
        <Label htmlFor="se-steps">Intervalle (JSON, optional)</Label>
        <Textarea
          id="se-steps"
          className="font-mono text-xs min-h-[96px]"
          spellCheck={false}
          placeholder={'[{"kind":"warmup","durationSec":900},{"repeat":6,"steps":[{"kind":"work","distanceM":800,"paceFastSec":290,"paceSlowSec":295},{"kind":"recovery","distanceM":400}]},{"kind":"cooldown","durationSec":600}]'}
          {...register('steps')}
        />
        <p className="text-xs text-muted-foreground">
          Schritte: kind = warmup, work, recovery oder cooldown; distanceM (Meter) oder durationSec; Pace in Sekunden pro km (paceFastSec, paceSlowSec).
        </p>
      </div>

      <div className="vspace-1">
        <Label htmlFor="se-note">Coach-Hinweis</Label>
        <Textarea id="se-note" className="min-h-[64px]" {...register('coachingNote')} />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Abbrechen</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</Button>
      </div>
    </form>
  )
}
