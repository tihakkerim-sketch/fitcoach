import { useState } from 'react'
import { useFieldArray, useForm, useFormContext, FormProvider } from 'react-hook-form'
import { Plus, Trash2, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { CreatePlanPayload, SessionType } from '@/types/ipc'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SESSION_TYPES: SessionType[] = ['running', 'cycling', 'strength', 'rest', 'custom']
const HR_ZONES = [1, 2, 3, 4, 5]

interface SessionTemplate {
  dayOfWeek: number
  type: SessionType
  targetDurationMin: string
  targetHrZone: string
  intensityLabel: string
}

interface PhaseForm {
  name: string
  durationWeeks: string
  sessions: SessionTemplate[]
}

interface PlanForm {
  name: string
  goalEvent: string
  goalDate: string
  phases: PhaseForm[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

function PhaseBuilder({ index, onRemove, onDuplicate }: { index: number; onRemove: () => void; onDuplicate: () => void }) {
  const { register, control, setValue, watch } = useFormContext<PlanForm>()
  const [collapsed, setCollapsed] = useState(false)
  const { fields, append, remove } = useFieldArray({ control, name: `phases.${index}.sessions` })

  const addSession = () =>
    append({ dayOfWeek: 1, type: 'running', targetDurationMin: '', targetHrZone: '', intensityLabel: '' })

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="px-1" onClick={() => setCollapsed(c => !c)}>
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
        <span className="font-medium text-sm flex-1">Phase {index + 1}</span>
        <Button type="button" variant="ghost" size="sm" className="px-2 text-muted-foreground" title="Duplicate phase" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="px-2 text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {!collapsed && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Phase name</Label>
              <Input placeholder="e.g. Base Building" {...register(`phases.${index}.name`)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Duration (weeks)</Label>
              <Input type="number" min={1} max={52} placeholder="4" {...register(`phases.${index}.durationWeeks`)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Weekly session template</Label>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addSession}>
                <Plus className="h-3 w-3 mr-1" /> Add session
              </Button>
            </div>

            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground py-2 text-center">No sessions yet — add at least one</p>
            )}

            {fields.map((field, si) => (
              <div key={field.id} className="grid grid-cols-[90px_110px_70px_70px_1fr_28px] gap-2 items-center">
                <div>
                  <Select
                    value={String(watch(`phases.${index}.sessions.${si}.dayOfWeek`))}
                    onValueChange={v => setValue(`phases.${index}.sessions.${si}.dayOfWeek`, Number(v) as any)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_NAMES.map((d, di) => (
                        <SelectItem key={di} value={String(di + 1)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select
                    value={watch(`phases.${index}.sessions.${si}.type`)}
                    onValueChange={v => setValue(`phases.${index}.sessions.${si}.type`, v as SessionType)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SESSION_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={480}
                  placeholder="min"
                  className="h-8 text-xs"
                  {...register(`phases.${index}.sessions.${si}.targetDurationMin`)}
                />
                <div>
                  <Select
                    value={watch(`phases.${index}.sessions.${si}.targetHrZone`) || '_none'}
                    onValueChange={v => setValue(`phases.${index}.sessions.${si}.targetHrZone`, v === '_none' ? '' : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Zone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">—</SelectItem>
                      {HR_ZONES.map(z => (
                        <SelectItem key={z} value={String(z)}>Z{z}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  placeholder="Intensity label"
                  className="h-8 text-xs"
                  {...register(`phases.${index}.sessions.${si}.intensityLabel`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-1 h-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(si)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function CreatePlanModal({ open, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const methods = useForm<PlanForm>({
    defaultValues: {
      name: '',
      goalEvent: '',
      goalDate: '',
      phases: [{ name: 'Base Building', durationWeeks: '4', sessions: [] }],
    },
  })

  const { fields: phaseFields, append: appendPhase, remove: removePhase } = useFieldArray({
    control: methods.control,
    name: 'phases',
  })

  const buildPayload = (data: PlanForm): CreatePlanPayload => {
    let globalWeek = 1
    return {
      name: data.name,
      goalEvent: data.goalEvent || undefined,
      goalDate: data.goalDate || undefined,
      phases: data.phases.map((phase, pi) => {
        const weeks = parseInt(phase.durationWeeks || '1', 10)
        const phaseWeeks = Array.from({ length: weeks }, () => {
          const weekNum = globalWeek++
          return {
            weekNumber: weekNum,
            sessions: phase.sessions.map(s => ({
              dayOfWeek: Number(s.dayOfWeek),
              type: s.type,
              targetDurationMin: s.targetDurationMin ? parseInt(s.targetDurationMin, 10) : undefined,
              targetHrZone: s.targetHrZone && s.targetHrZone !== '_none' ? parseInt(s.targetHrZone, 10) : undefined,
              intensityLabel: s.intensityLabel || undefined,
            })),
          }
        })
        return {
          name: phase.name || `Phase ${pi + 1}`,
          orderIndex: pi,
          durationWeeks: weeks,
          weeks: phaseWeeks,
        }
      }),
    }
  }

  const onSubmit = async (data: PlanForm) => {
    if (!data.name.trim()) { setError('Plan name is required'); return }
    if (data.phases.length === 0) { setError('Add at least one phase'); return }
    setSaving(true)
    setError(null)
    try {
      await invoke(IPC.PLANS_CREATE, buildPayload(data))
      onSaved()
      onClose()
      methods.reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Training Plan</DialogTitle>
        </DialogHeader>

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-5">
              {/* Plan info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="plan-name">Plan name *</Label>
                  <Input id="plan-name" placeholder="e.g. Half Marathon 12-Week" {...methods.register('name')} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="goal-event">Goal event</Label>
                  <Input id="goal-event" placeholder="e.g. City Half Marathon" {...methods.register('goalEvent')} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="goal-date">Goal date</Label>
                  <Input id="goal-date" type="date" {...methods.register('goalDate')} />
                </div>
              </div>

              {/* Phases */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Phases</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendPhase({ name: '', durationWeeks: '4', sessions: [] })}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Phase
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Columns: Day · Type · Duration (min) · HR Zone · Intensity label
                </p>

                <div className="space-y-3">
                  {phaseFields.map((field, i) => (
                    <PhaseBuilder
                      key={field.id}
                      index={i}
                      onRemove={() => removePhase(i)}
                      onDuplicate={() => {
                        const current = methods.getValues(`phases.${i}`)
                        appendPhase({
                          name: current.name ? `${current.name} (copy)` : '',
                          durationWeeks: current.durationWeeks,
                          sessions: current.sessions.map(s => ({ ...s })),
                        })
                      }}
                    />
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Plan'}</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
