import { z } from 'zod'

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Required (YYYY-MM-DD)')
const timeField = z.string().regex(/^\d{2}:\d{2}$/, 'Required (HH:MM)')
const hrField   = z.number().int().min(30).max(300)

const base = z.object({
  date:  dateField,
  notes: z.string().max(2000).optional(),
})

export const hrZoneSchema = z.object({
  z1: z.number().min(0).max(100),
  z2: z.number().min(0).max(100),
  z3: z.number().min(0).max(100),
  z4: z.number().min(0).max(100),
  z5: z.number().min(0).max(100),
})

export const runningSchema = base.extend({
  durationMin:        z.number({ required_error: 'Required' }).positive().max(1440),
  startTime:          timeField.optional(),
  distanceKm:         z.number().positive().max(500).optional(),
  avgHr:              hrField.optional(),
  maxHr:              hrField.optional(),
  perceivedEffort:    z.number().int().min(1).max(10).optional(),
  surfaceType:        z.enum(['road', 'trail', 'track', 'treadmill', 'other']).optional(),
  hrZoneDistribution: hrZoneSchema.optional(),
}).superRefine((v, ctx) => {
  if (v.avgHr && v.maxHr && v.maxHr < v.avgHr) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Max HR must be ≥ Avg HR', path: ['maxHr'] })
  }
})

export const cyclingSchema = base.extend({
  durationMin: z.number({ required_error: 'Required' }).positive().max(1440),
  distanceKm:  z.number().positive().max(1000).optional(),
  avgHr:       hrField.optional(),
  maxHr:       hrField.optional(),
  avgCadence:  z.number().int().min(20).max(200).optional(),
}).superRefine((v, ctx) => {
  if (v.avgHr && v.maxHr && v.maxHr < v.avgHr) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Max HR must be ≥ Avg HR', path: ['maxHr'] })
  }
})

export const sleepSchema = base.extend({
  bedtime:      timeField,
  wakeTime:     timeField,
  sleepQuality: z.number().int().min(1).max(100).optional(),
})

export const exerciseSchema = z.object({
  name: z.string().min(1, 'Name required').max(100),
  sets: z.number().int().min(1).max(100),
  reps: z.number().int().min(1).max(10000),
})

export const strengthSchema = base.extend({
  durationMin: z.number({ required_error: 'Required' }).positive().max(1440),
  exercises:   z.array(exerciseSchema).min(1, 'Add at least one exercise'),
})

export const customSchema = base.extend({
  durationMin: z.number({ required_error: 'Required' }).positive().max(1440),
  typeLabel:   z.string().min(1, 'Activity name required').max(100),
})

export type RunningFormData  = z.infer<typeof runningSchema>
export type CyclingFormData  = z.infer<typeof cyclingSchema>
export type SleepFormData    = z.infer<typeof sleepSchema>
export type StrengthFormData = z.infer<typeof strengthSchema>
export type CustomFormData   = z.infer<typeof customSchema>
export type Exercise         = z.infer<typeof exerciseSchema>
