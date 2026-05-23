import { useFormContext } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function CyclingForm() {
  const { register, formState: { errors } } = useFormContext()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="durationMin">Duration (min) *</Label>
          <Input
            id="durationMin"
            type="number"
            min={1}
            max={1440}
            {...register('durationMin', { valueAsNumber: true })}
          />
          {errors.durationMin && <p className="text-xs text-destructive">{String(errors.durationMin.message)}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="distanceKm">Distance (km)</Label>
          <Input
            id="distanceKm"
            type="number"
            step="0.01"
            min={0}
            max={1000}
            {...register('distanceKm', { setValueAs: (v: string) => v === '' || v == null ? undefined : Number(v) })}
          />
          {errors.distanceKm && <p className="text-xs text-destructive">{String(errors.distanceKm.message)}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="startTime">Start Time</Label>
          <Input id="startTime" type="time" {...register('startTime')} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="avgCadence">
            Avg Cadence (rpm) <span className="text-muted-foreground font-normal">— optional</span>
          </Label>
          <Input
            id="avgCadence"
            type="number"
            min={30}
            max={200}
            placeholder="e.g. 85"
            {...register('avgCadence', { setValueAs: v => v === '' || v == null ? undefined : Number(v) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="avgHr">Avg HR (bpm)</Label>
          <Input
            id="avgHr"
            type="number"
            min={30}
            max={250}
            {...register('avgHr', { setValueAs: (v: string) => v === '' || v == null ? undefined : Number(v) })}
          />
          {errors.avgHr && <p className="text-xs text-destructive">{String(errors.avgHr.message)}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="maxHr">Max HR (bpm)</Label>
          <Input
            id="maxHr"
            type="number"
            min={30}
            max={250}
            {...register('maxHr', { setValueAs: (v: string) => v === '' || v == null ? undefined : Number(v) })}
          />
          {errors.maxHr && <p className="text-xs text-destructive">{String(errors.maxHr.message)}</p>}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="perceivedEffort">Perceived Effort (1–10)</Label>
        <Input
          id="perceivedEffort"
          type="number"
          min={1}
          max={10}
          {...register('perceivedEffort', { setValueAs: (v: string) => v === '' || v == null ? undefined : Number(v) })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} placeholder="How did it feel?" {...register('notes')} />
      </div>
    </div>
  )
}
