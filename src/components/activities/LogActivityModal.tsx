import { useState, useEffect } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
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
import { IPC } from '@/types/ipc'
import type { ActivityType, CreateActivityPayload } from '@/types/ipc'
type Tab = ActivityType

const TABS: { value: Tab; label: string }[] = [
  { value: 'running', label: 'Running' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'strength', label: 'Strength' },
  { value: 'custom', label: 'Custom' },
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
  prefill?: Partial<CreateActivityPayload>
}

type AnyFormData = Record<string, unknown>

export function LogActivityModal({ open, onClose, onSaved, prefill }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('running')
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const schema = schemaMap[activeTab]
  const methods = useForm<AnyFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      exercises: [],
    },
  })

  // When prefill changes (Garmin import), set the tab and values
  useEffect(() => {
    if (prefill) {
      const t = prefill.type ?? 'running'
      setActiveTab(t as Tab)
      methods.reset({
        date: prefill.date ?? format(new Date(), 'yyyy-MM-dd'),
        ...prefill,
      })
    }
  }, [prefill, methods])

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
      const payload: CreateActivityPayload = {
        ...(data as Partial<CreateActivityPayload>),
        type: activeTab,
        source: prefill?.source ?? 'manual',
        garminFileName: prefill?.garminFileName,
        rawGarminData: prefill?.rawGarminData,
      } as CreateActivityPayload
      await invoke(IPC.ACTIVITIES_CREATE, payload)
      onSaved()
      onClose()
      methods.reset({ date: format(new Date(), 'yyyy-MM-dd'), exercises: [] })
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Failed to save activity')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
        </DialogHeader>

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-4">
              {/* Date field — shared across all tabs */}
              <div className="space-y-1">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  max={format(new Date(), 'yyyy-MM-dd')}
                  {...methods.register('date')}
                />
                {methods.formState.errors.date && (
                  <p className="text-xs text-destructive">
                    {String(methods.formState.errors.date.message)}
                  </p>
                )}
              </div>

              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className="w-full">
                  {TABS.map(t => (
                    <TabsTrigger key={t.value} value={t.value} className="flex-1">
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
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Activity'}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
