import { optNum } from './numField'
import { useFormContext } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function CyclingForm() {
  const { register, formState: { errors } } = useFormContext()

  return (
    <div className="vspace-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="vspace-1">
          <Label htmlFor="durationMin">Dauer (min) *</Label>
          <Input
            id="durationMin"
            type="number"
            min={1}
            max={1440}
            {...register('durationMin', optNum)}
          />
          {errors.durationMin && <p className="text-xs text-destructive">{String(errors.durationMin.message)}</p>}
        </div>

        <div className="vspace-1">
          <Label htmlFor="distanceKm">Distanz (km)</Label>
          <Input
            id="distanceKm"
            type="number"
            step="0.01"
            min={0}
            max={1000}
            {...register('distanceKm', optNum)}
          />
          {errors.distanceKm && <p className="text-xs text-destructive">{String(errors.distanceKm.message)}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="vspace-1">
          <Label htmlFor="startTime">Startzeit</Label>
          <Input id="startTime" type="time" {...register('startTime')} />
        </div>

        <div className="vspace-1">
          <Label htmlFor="avgCadence">
            Ø Kadenz (U/min) <span className="text-muted-foreground font-normal">– optional</span>
          </Label>
          <Input
            id="avgCadence"
            type="number"
            min={30}
            max={200}
            placeholder="z. B. 85"
            {...register('avgCadence', optNum)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="vspace-1">
          <Label htmlFor="avgHr">Ø Puls (bpm)</Label>
          <Input
            id="avgHr"
            type="number"
            min={30}
            max={250}
            {...register('avgHr', optNum)}
          />
          {errors.avgHr && <p className="text-xs text-destructive">{String(errors.avgHr.message)}</p>}
        </div>

        <div className="vspace-1">
          <Label htmlFor="maxHr">Max. Puls (bpm)</Label>
          <Input
            id="maxHr"
            type="number"
            min={30}
            max={250}
            {...register('maxHr', optNum)}
          />
          {errors.maxHr && <p className="text-xs text-destructive">{String(errors.maxHr.message)}</p>}
        </div>
      </div>

      <div className="vspace-1">
        <Label htmlFor="perceivedEffort">Anstrengung (1–10)</Label>
        <Input
          id="perceivedEffort"
          type="number"
          min={1}
          max={10}
          {...register('perceivedEffort', optNum)}
        />
      </div>

      <div className="vspace-1">
        <Label htmlFor="notes">Notizen</Label>
        <Textarea id="notes" rows={3} placeholder="Wie hat es sich angefühlt?" {...register('notes')} />
      </div>
    </div>
  )
}
