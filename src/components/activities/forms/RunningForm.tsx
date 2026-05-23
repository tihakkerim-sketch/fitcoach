import { useFormContext } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function RunningForm() {
  const { register, setValue, watch, formState: { errors } } = useFormContext()

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
            max={500}
            {...register('distanceKm', { valueAsNumber: true })}
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
          <Label htmlFor="surfaceType">Surface</Label>
          <Select onValueChange={v => setValue('surfaceType', v)} value={watch('surfaceType') ?? ''}>
            <SelectTrigger id="surfaceType">
              <SelectValue placeholder="Select surface" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="road">Road</SelectItem>
              <SelectItem value="trail">Trail</SelectItem>
              <SelectItem value="track">Track</SelectItem>
              <SelectItem value="treadmill">Treadmill</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
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
            {...register('avgHr', { valueAsNumber: true })}
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
            {...register('maxHr', { valueAsNumber: true })}
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
          {...register('perceivedEffort', { valueAsNumber: true })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} placeholder="How did it feel?" {...register('notes')} />
      </div>
    </div>
  )
}
