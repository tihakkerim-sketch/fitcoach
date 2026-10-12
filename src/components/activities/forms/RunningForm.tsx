import { useEffect, useState } from 'react'
import { optNum } from './numField'
import { useFormContext } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { Shoe } from '@/types/ipc'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function RunningForm() {
  const { register, setValue, getValues, watch, formState: { errors } } = useFormContext()
  const [shoes, setShoes] = useState<Shoe[] | null>(null)

  useEffect(() => {
    let cancelled = false
    invoke(IPC.SHOES_LIST)
      .then(list => {
        if (cancelled) return
        setShoes(list)
        // Neuer Lauf: Standard-Schuh vorauswählen (undefined = noch nichts gewählt)
        if (getValues('shoeId') === undefined) {
          const def = list.find(x => x.isDefault && !x.retired)
          setValue('shoeId', def ? def.id : null)
        }
      })
      .catch(() => { if (!cancelled) setShoes([]) })
    return () => { cancelled = true }
  }, [getValues, setValue])

  const shoeId = watch('shoeId') as number | null | undefined
  const selectableShoes = (shoes ?? []).filter(x => !x.retired || x.id === shoeId)

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
            max={500}
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
          <Label htmlFor="surfaceType">Untergrund</Label>
          <Select onValueChange={v => setValue('surfaceType', v)} value={watch('surfaceType') ?? ''}>
            <SelectTrigger id="surfaceType">
              <SelectValue placeholder="Untergrund wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="road">Straße</SelectItem>
              <SelectItem value="trail">Gelände</SelectItem>
              <SelectItem value="track">Bahn</SelectItem>
              <SelectItem value="treadmill">Laufband</SelectItem>
              <SelectItem value="other">Sonstiges</SelectItem>
            </SelectContent>
          </Select>
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
        <Label htmlFor="shoeId">Schuh</Label>
        {shoes && shoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Schuhe kannst du in den <Link to="/settings" className="text-primary underline underline-offset-2">Einstellungen</Link> anlegen.
          </p>
        ) : (
          <Select
            value={shoeId == null ? 'none' : String(shoeId)}
            onValueChange={v => setValue('shoeId', v === 'none' ? null : Number(v))}
          >
            <SelectTrigger id="shoeId">
              <SelectValue placeholder="Schuh wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Kein Schuh</SelectItem>
              {selectableShoes.map(x => (
                <SelectItem key={x.id} value={String(x.id)}>
                  {x.name}{x.retired ? ' (ausgemustert)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="vspace-1">
        <Label htmlFor="notes">Notizen</Label>
        <Textarea id="notes" rows={3} placeholder="Wie hat es sich angefühlt?" {...register('notes')} />
      </div>
    </div>
  )
}
