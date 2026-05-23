import { useFormContext } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function SleepForm() {
  const { register, formState: { errors } } = useFormContext()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="bedtime">Bedtime *</Label>
          <Input id="bedtime" type="time" {...register('bedtime')} />
          {errors.bedtime && <p className="text-xs text-destructive">{String(errors.bedtime.message)}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="wakeTime">Wake Time *</Label>
          <Input id="wakeTime" type="time" {...register('wakeTime')} />
          {errors.wakeTime && <p className="text-xs text-destructive">{String(errors.wakeTime.message)}</p>}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="sleepQuality">Sleep Quality (1–100)</Label>
        <div className="flex items-center gap-3">
          <Input
            id="sleepQuality"
            type="number"
            min={1}
            max={100}
            className="w-24"
            {...register('sleepQuality', { valueAsNumber: true })}
          />
          <span className="text-sm text-muted-foreground">Matches Garmin Body Battery scale</span>
        </div>
        {errors.sleepQuality && <p className="text-xs text-destructive">{String(errors.sleepQuality.message)}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} placeholder="How did you sleep?" {...register('notes')} />
      </div>
    </div>
  )
}
