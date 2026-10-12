import { optNum } from './numField'
import { useFormContext } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function SleepForm() {
  const { register, formState: { errors } } = useFormContext()

  return (
    <div className="vspace-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="vspace-1">
          <Label htmlFor="bedtime">Zu Bett *</Label>
          <Input id="bedtime" type="time" {...register('bedtime')} />
          {errors.bedtime && <p className="text-xs text-destructive">{String(errors.bedtime.message)}</p>}
        </div>

        <div className="vspace-1">
          <Label htmlFor="wakeTime">Aufgewacht um *</Label>
          <Input id="wakeTime" type="time" {...register('wakeTime')} />
          {errors.wakeTime && <p className="text-xs text-destructive">{String(errors.wakeTime.message)}</p>}
        </div>
      </div>

      <div className="vspace-1">
        <Label htmlFor="sleepQuality">Schlafqualität (1–100)</Label>
        <div className="flex items-center gap-3">
          <Input
            id="sleepQuality"
            type="number"
            min={1}
            max={100}
            className="w-24"
            {...register('sleepQuality', optNum)}
          />
          <span className="text-sm text-muted-foreground">Gleiche Skala wie Garmin Body Battery</span>
        </div>
        {errors.sleepQuality && <p className="text-xs text-destructive">{String(errors.sleepQuality.message)}</p>}
      </div>

      <div className="vspace-1">
        <Label htmlFor="notes">Notizen</Label>
        <Textarea id="notes" rows={3} placeholder="Wie hast du geschlafen?" {...register('notes')} />
      </div>
    </div>
  )
}
