import { z } from 'zod'

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte ein gültiges Datum angeben')
const timeField = z.string().regex(/^\d{2}:\d{2}$/, 'Bitte eine Uhrzeit angeben (HH:MM)')
// Leeres Zeitfeld = nicht ausgefüllt
const optionalTime = z.preprocess(v => (v === '' ? undefined : v), timeField.optional())
const hrField   = z.number('Bitte eine Zahl eingeben').int('Bitte eine ganze Zahl eingeben')
  .min(30, 'Mindestens 30 bpm').max(300, 'Höchstens 300 bpm')
// Zod 4: „Pflichtfeld“ nur, wenn das Feld leer ist; sonst die spezifische Meldung
const requiredMsg = (issue: { input?: unknown }) => (issue.input === undefined ? 'Pflichtfeld' : 'Bitte eine Zahl eingeben')
const duration = () =>
  z.number({ error: requiredMsg }).positive('Bitte mehr als 0 Minuten eingeben').max(1440, 'Höchstens 1440 Minuten (24 Std.)')

const base = z.object({
  date:  dateField,
  notes: z.string().max(2000, 'Höchstens 2000 Zeichen').optional(),
})

export const hrZoneSchema = z.object({
  z1: z.number().min(0).max(100),
  z2: z.number().min(0).max(100),
  z3: z.number().min(0).max(100),
  z4: z.number().min(0).max(100),
  z5: z.number().min(0).max(100),
})

const maxHrMsg = 'Der Maximalpuls muss mindestens so hoch sein wie der Durchschnittspuls'

export const runningSchema = base.extend({
  durationMin:        duration(),
  startTime:          optionalTime,
  distanceKm:         z.number('Bitte eine Zahl eingeben').positive('Bitte mehr als 0 km eingeben').max(500, 'Höchstens 500 km').optional(),
  avgHr:              hrField.optional(),
  maxHr:              hrField.optional(),
  perceivedEffort:    z.number('Bitte eine Zahl eingeben').int('Bitte eine ganze Zahl eingeben').min(1, 'Wert von 1 bis 10').max(10, 'Wert von 1 bis 10').optional(),
  surfaceType:        z.enum(['road', 'trail', 'track', 'treadmill', 'other']).optional(),
  hrZoneDistribution: hrZoneSchema.optional(),
  shoeId:             z.number().nullable().optional(),
}).superRefine((v, ctx) => {
  if (v.avgHr && v.maxHr && v.maxHr < v.avgHr) {
    ctx.addIssue({ code: 'custom', message: maxHrMsg, path: ['maxHr'] })
  }
})

export const cyclingSchema = base.extend({
  durationMin: duration(),
  startTime:   optionalTime,
  distanceKm:  z.number('Bitte eine Zahl eingeben').positive('Bitte mehr als 0 km eingeben').max(1000, 'Höchstens 1000 km').optional(),
  avgHr:       hrField.optional(),
  maxHr:       hrField.optional(),
  avgCadence:  z.number('Bitte eine Zahl eingeben').int('Bitte eine ganze Zahl eingeben').min(20, 'Mindestens 20').max(200, 'Höchstens 200').optional(),
  perceivedEffort: z.number('Bitte eine Zahl eingeben').int('Bitte eine ganze Zahl eingeben').min(1, 'Wert von 1 bis 10').max(10, 'Wert von 1 bis 10').optional(),
}).superRefine((v, ctx) => {
  if (v.avgHr && v.maxHr && v.maxHr < v.avgHr) {
    ctx.addIssue({ code: 'custom', message: maxHrMsg, path: ['maxHr'] })
  }
})

export const sleepSchema = base.extend({
  bedtime:      timeField,
  wakeTime:     timeField,
  sleepQuality: z.number('Bitte eine Zahl eingeben').int('Bitte eine ganze Zahl eingeben').min(1, 'Wert von 1 bis 100').max(100, 'Wert von 1 bis 100').optional(),
})

export const exerciseSchema = z.object({
  name: z.string().min(1, 'Bitte einen Namen eingeben').max(100),
  sets: z.number('Bitte eine Zahl eingeben').int().min(1, 'Mindestens 1').max(100),
  reps: z.number('Bitte eine Zahl eingeben').int().min(1, 'Mindestens 1').max(10000),
})

export const strengthSchema = base.extend({
  durationMin: duration(),
  exercises:   z.array(exerciseSchema).min(1, 'Bitte mindestens eine Übung hinzufügen'),
})

export const customSchema = base.extend({
  durationMin: duration(),
  startTime:   optionalTime,
  avgHr:       hrField.optional(),
  perceivedEffort: z.number('Bitte eine Zahl eingeben').int('Bitte eine ganze Zahl eingeben').min(1, 'Wert von 1 bis 10').max(10, 'Wert von 1 bis 10').optional(),
  typeLabel:   z.string().min(1, 'Bitte einen Namen eingeben').max(100),
})

export type RunningFormData  = z.infer<typeof runningSchema>
export type CyclingFormData  = z.infer<typeof cyclingSchema>
export type SleepFormData    = z.infer<typeof sleepSchema>
export type StrengthFormData = z.infer<typeof strengthSchema>
export type CustomFormData   = z.infer<typeof customSchema>
export type Exercise         = z.infer<typeof exerciseSchema>
