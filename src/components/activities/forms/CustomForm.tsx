import { useFormContext } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function CustomForm() {
  const { register, formState: { errors } } = useFormContext()

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="typeLabel">Activity Label *</Label>
        <Input
          id="typeLabel"
          placeholder="e.g. Yoga, Swimming, Hiking"
          {...register('typeLabel')}
        />
        {errors.typeLabel && <p className="text-xs text-destructive">{String(errors.typeLabel.message)}</p>}
      </div>

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
          <Label htmlFor="startTime">Start Time</Label>
          <Input id="startTime" type="time" {...register('startTime')} />
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
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} placeholder="What did you do?" {...register('notes')} />
      </div>
    </div>
  )
}
