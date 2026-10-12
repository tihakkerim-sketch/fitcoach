import { useEffect, useState } from 'react'
import { useForm, FormProvider, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { RunningForm } from './forms/RunningForm'
import { CyclingForm } from './forms/CyclingForm'
import { SleepForm } from './forms/SleepForm'
import { StrengthForm } from './forms/StrengthForm'
import { CustomForm } from './forms/CustomForm'
import { runningSchema, cyclingSchema, sleepSchema, strengthSchema, customSchema } from '@/schemas/activity'
import { invoke } from '@/lib/ipc'
import { today } from '@/lib/today'
import { emitDataChanged } from '@/lib/dataEvents'
import { IPC } from '@/types/ipc'
import type { ActivityType, ActivityRow, CreateActivityPayload } from '@/types/ipc'
type Tab = ActivityType

const TABS: { value: Tab; label: string }[] = [
  { value: 'running', label: 'Laufen' },
  { value: 'cycling', label: 'Radfahren' },
  { value: 'sleep', label: 'Schlaf' },
  { value: 'strength', label: 'Kraft' },
  { value: 'custom', label: 'Sonstiges' },
]

const schemaMap = {
  running: runningSchema,
  cycling: cyclingSchema,
  sleep: sleepSchema,
  strength: strengthSchema,
  custom: customSchema,
} as const

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** Wenn gesetzt: Bearbeiten-Modus für diese Aktivität. */
  activity?: ActivityRow
}

/** Felder je Typ, die beim Bearbeiten gesendet werden (leer = null). */
const EDIT_FIELDS: Record<Tab, string[]> = {
  running: ['durationMin', 'startTime', 'distanceKm', 'avgHr', 'maxHr', 'perceivedEffort', 'surfaceType', 'notes', 'shoeId'],
  cycling: ['durationMin', 'startTime', 'distanceKm', 'avgHr', 'maxHr', 'avgCadence', 'perceivedEffort', 'notes'],
  sleep: ['bedtime', 'wakeTime', 'sleepQuality', 'notes'],
  strength: ['durationMin', 'exercises', 'notes'],
  custom: ['typeLabel', 'durationMin', 'startTime', 'avgHr', 'perceivedEffort', 'notes'],
}

function activityToFormValues(a: ActivityRow): AnyFormData {
  const values: AnyFormData = { date: a.date }
  for (const key of EDIT_FIELDS[a.type]) {
    const v = (a as unknown as Record<string, unknown>)[key]
    if (v !== null && v !== undefined) values[key] = v
  }
  if (a.type === 'running' && values.shoeId === undefined) values.shoeId = null
  if (a.type === 'strength') {
    let ex: unknown = a.exercises
    if (typeof ex === 'string') { try { ex = JSON.parse(ex) } catch { ex = [] } }
    values.exercises = Array.isArray(ex) ? ex : []
  }
  return values
}

type AnyFormData = Record<string, unknown>

export function LogActivityModal({ open, onClose, onSaved, activity }: Props) {
  const editing = !!activity
  const [activeTab, setActiveTab] = useState<Tab>(activity?.type ?? 'running')
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const schema = schemaMap[activeTab]
  const methods = useForm<AnyFormData>({
    resolver: zodResolver(schema) as unknown as Resolver<AnyFormData>,
    defaultValues: activity ? activityToFormValues(activity) : { date: today(), exercises: [] },
  })

  // Beim Öffnen: Bearbeiten → vorbefüllen, Neu → leeres Formular mit heutigem Datum
  useEffect(() => {
    if (!open) return
    setServerError(null)
    if (activity) {
      setActiveTab(activity.type)
      methods.reset(activityToFormValues(activity))
    } else {
      methods.reset({ date: today(), exercises: [] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity?.id])

  // Reset form when switching tabs so validation matches the new schema
  const handleTabChange = (tab: string) => {
    setActiveTab(tab as Tab)
    methods.reset({ date: methods.getValues('date') as string, exercises: [] })
    setServerError(null)
  }

  const onSubmit = async (data: AnyFormData) => {
    setSaving(true)
    setServerError(null)
    try {
      if (activity) {
        const update: Record<string, unknown> = { id: activity.id, date: data.date }
        for (const key of EDIT_FIELDS[activity.type]) {
          const v = data[key]
          update[key] = v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v)) ? null : v
        }
        await invoke(IPC.ACTIVITIES_UPDATE, update as never)
      } else {
        const payload: CreateActivityPayload = {
          ...(data as Partial<CreateActivityPayload>),
          type: activeTab,
          source: 'manual',
        } as CreateActivityPayload
        await invoke(IPC.ACTIVITIES_CREATE, payload)
      }
      emitDataChanged()
      onSaved()
      onClose()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Aktivität bearbeiten' : 'Aktivität erfassen'}</DialogTitle>
        </DialogHeader>

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
            <div className="vspace-4">
              {/* Date field — shared across all tabs */}
              <div className="vspace-1">
                <Label htmlFor="date">Datum *</Label>
                <Input
                  id="date"
                  type="date"
                  max={today()}
                  {...methods.register('date')}
                />
                {methods.formState.errors.date && (
                  <p className="text-xs text-destructive">
                    {String(methods.formState.errors.date.message)}
                  </p>
                )}
              </div>

              <Tabs value={activeTab} onValueChange={editing ? undefined : handleTabChange}>
                <TabsList className="w-full">
                  {TABS.map(t => (
                    <TabsTrigger key={t.value} value={t.value} className="flex-1" disabled={editing && t.value !== activeTab}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="running" className="mt-4">
                  <RunningForm />
                </TabsContent>
                <TabsContent value="cycling" className="mt-4">
                  <CyclingForm />
                </TabsContent>
                <TabsContent value="sleep" className="mt-4">
                  <SleepForm />
                </TabsContent>
                <TabsContent value="strength" className="mt-4">
                  <StrengthForm />
                </TabsContent>
                <TabsContent value="custom" className="mt-4">
                  <CustomForm />
                </TabsContent>
              </Tabs>

              {serverError && (
                <p className="text-sm text-destructive">{serverError}</p>
              )}
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Speichert …' : editing ? 'Änderungen speichern' : 'Speichern'}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
