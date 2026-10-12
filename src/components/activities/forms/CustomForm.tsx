import { optNum } from './numField'
import { useFormContext } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function CustomForm() {
  const { register, formState: { errors } } = useFormContext()

  return (
    <div className="vspace-4">
      <div className="vspace-1">
        <Label htmlFor="typeLabel">Name der Aktivität *</Label>
        <Input
          id="typeLabel"
          placeholder="z. B. Yoga, Schwimmen, Wandern"
          {...register('typeLabel')}
        />
        {errors.typeLabel && <p className="text-xs text-destructive">{String(errors.typeLabel.message)}</p>}
      </div>

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
          <Label htmlFor="startTime">Startzeit</Label>
          <Input id="startTime" type="time" {...register('startTime')} />
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
      </div>

      <div className="vspace-1">
        <Label htmlFor="notes">Notizen</Label>
        <Textarea id="notes" rows={3} placeholder="Was hast du gemacht?" {...register('notes')} />
      </div>
    </div>
  )
}
