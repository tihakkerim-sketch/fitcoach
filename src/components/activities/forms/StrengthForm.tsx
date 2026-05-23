import { useFormContext, useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

export function StrengthForm() {
  const { register, control, formState: { errors } } = useFormContext()
  const { fields, append, remove } = useFieldArray({ control, name: 'exercises' })

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
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Exercises *</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ name: '', sets: 3, reps: 10 })}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Exercise
          </Button>
        </div>

        {errors.exercises && typeof errors.exercises.message === 'string' && (
          <p className="text-xs text-destructive">{errors.exercises.message}</p>
        )}

        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Add at least one exercise
            </p>
          )}
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-[1fr_80px_80px_32px] gap-2 items-start">
              <div>
                <Input
                  placeholder="Exercise name"
                  {...register(`exercises.${index}.name`)}
                />
                {(errors.exercises as any)?.[index]?.name && (
                  <p className="text-xs text-destructive mt-0.5">
                    {String((errors.exercises as any)[index].name.message)}
                  </p>
                )}
              </div>
              <div>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  placeholder="Sets"
                  {...register(`exercises.${index}.sets`, { valueAsNumber: true })}
                />
              </div>
              <div>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  placeholder="Reps"
                  {...register(`exercises.${index}.reps`, { valueAsNumber: true })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-2 text-muted-foreground hover:text-destructive"
                onClick={() => remove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} placeholder="How was the session?" {...register('notes')} />
      </div>
    </div>
  )
}
