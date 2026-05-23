import { useState, useEffect, useCallback, useRef, type ElementType } from 'react'
import { format } from 'date-fns'
import { Sun, Moon, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { DailyCheckin, UpsertCheckinPayload } from '@/types/ipc'
import { cn } from '@/lib/utils'

// ── Score picker ──────────────────────────────────────────────────────────────

function ScorePicker({
  label, value, onChange, emojis, descriptions, required,
}: {
  label: string
  value: number | undefined
  onChange: (v: number) => void
  emojis: string[]
  descriptions: string[]
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'flex-1 h-12 rounded-xl border text-xl transition-all select-none',
              value === n
                ? 'border-primary bg-primary/10 scale-105'
                : 'border-border bg-card hover:border-primary/40 active:scale-95'
            )}
            title={descriptions[n]}
          >
            {emojis[n]}
          </button>
        ))}
      </div>
      {value != null && (
        <p className="text-xs text-muted-foreground text-center">{descriptions[value]}</p>
      )}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function CheckinSection({
  title, subtitle, icon: Icon, iconColor,
  children, done, doneSummary,
  onSubmit, saving, canSubmit, submitHint,
}: {
  title: string
  subtitle?: string
  icon: ElementType
  iconColor: string
  children: React.ReactNode
  done: boolean
  doneSummary?: string       // shown in header when done, e.g. "Energy 4 · Clarity 3"
  onSubmit: () => void
  saving: boolean
  canSubmit: boolean         // controls Save button disabled state
  submitHint?: string        // helper text shown when canSubmit is false
}) {
  const [expanded, setExpanded] = useState(!done)

  // Auto-collapse when the section completes (done flips false → true after save)
  const prevDone = useRef(done)
  useEffect(() => {
    if (!prevDone.current && done) setExpanded(false)
    prevDone.current = done
  }, [done])

  return (
    <div className={cn(
      'rounded-xl border bg-card overflow-hidden transition-colors',
      done && 'border-green-500/30'
    )}>
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-5 text-left"
      >
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
          iconColor
        )}>
          <Icon style={{ width: 18, height: 18 }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{title}</p>
          {done && doneSummary && (
            <p className="text-xs text-green-500 mt-0.5">✓ {doneSummary}</p>
          )}
          {done && !doneSummary && (
            <p className="text-xs text-green-500 mt-0.5">Completed ✓</p>
          )}
          {!done && subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {done && <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />}
      </button>

      {/* Expandable body */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-border/60 pt-4 space-y-4">
          {children}
          <div className="space-y-1.5">
            <Button
              onClick={onSubmit}
              disabled={saving || !canSubmit}
              className="w-full"
            >
              {saving ? 'Saving…' : done ? 'Update' : 'Save'}
            </Button>
            {!canSubmit && submitHint && (
              <p className="text-xs text-muted-foreground text-center">{submitHint}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DailyCheckin() {
  const todayDate = format(new Date(), 'yyyy-MM-dd')

  const [checkin, setCheckin] = useState<DailyCheckin | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  // Morning form
  const [mEnergy,    setMEnergy]    = useState<number | undefined>()
  const [mClarity,   setMClarity]   = useState<number | undefined>()
  const [mIntention, setMIntention] = useState('')

  // Evening form
  const [eRating, setERating] = useState<number | undefined>()
  const [eWins,   setEWins]   = useState('')
  const [eNote,   setENote]   = useState('')

  // ── Load today's check-in ──────────────────────────────────────────────────

  const load = useCallback(async () => {
    const c = await invoke<DailyCheckin | null>(IPC.CHECKIN_GET, todayDate).catch(() => null)
    setCheckin(c)
    if (c) {
      // null from DB → undefined for form state (unselected)
      setMEnergy(c.morningEnergy    ?? undefined)
      setMClarity(c.morningClarity  ?? undefined)
      setMIntention(c.morningIntention ?? '')
      setERating(c.eveningRating    ?? undefined)
      setEWins(c.eveningWins        ?? '')
      setENote(c.eveningNote        ?? '')
    }
  }, [todayDate])

  useEffect(() => { load() }, [load])

  // ── Upsert helper ──────────────────────────────────────────────────────────
  //
  // Each section preserves the OTHER section's already-saved values by reading
  // from `checkin` state. The shared `saving` flag ensures only one save can
  // run at a time, so `checkin` is always up-to-date before the next save.

  const upsert = useCallback(async (fields: Omit<UpsertCheckinPayload, 'date'>) => {
    setSaving(true)
    setSaveErr(null)
    try {
      const updated = await invoke<DailyCheckin>(
        IPC.CHECKIN_UPSERT,
        { date: todayDate, ...fields }
      )
      setCheckin(updated)
    } catch {
      setSaveErr('Save failed. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }, [todayDate])

  const saveMorning = useCallback(() => upsert({
    morningEnergy:    mEnergy,
    morningClarity:   mClarity,
    morningIntention: mIntention.trim() || undefined,
    // Carry forward any existing evening data so it isn't overwritten
    eveningRating: checkin?.eveningRating ?? undefined,
    eveningWins:   checkin?.eveningWins   ?? undefined,
    eveningNote:   checkin?.eveningNote   ?? undefined,
  }), [upsert, mEnergy, mClarity, mIntention, checkin])

  const saveEvening = useCallback(() => upsert({
    // Carry forward any existing morning data so it isn't overwritten
    morningEnergy:    checkin?.morningEnergy    ?? undefined,
    morningClarity:   checkin?.morningClarity   ?? undefined,
    morningIntention: checkin?.morningIntention ?? undefined,
    eveningRating: eRating,
    eveningWins:   eWins.trim() || undefined,
    eveningNote:   eNote.trim() || undefined,
  }), [upsert, eRating, eWins, eNote, checkin])

  // ── Derived state ──────────────────────────────────────────────────────────

  const morningDone = !!(checkin?.morningEnergy)   // null/undefined → false
  const eveningDone = !!(checkin?.eveningRating)
  const isEvening   = new Date().getHours() >= 17

  // Summary strings shown in collapsed section headers
  const morningSummary = morningDone
    ? `Energy ${checkin!.morningEnergy}/5 · Clarity ${checkin!.morningClarity ?? '?'}/5`
    : undefined
  const eveningSummary = eveningDone
    ? `Day rating ${checkin!.eveningRating}/5`
    : undefined

  return (
    <div className="p-8 space-y-8 max-w-xl">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Daily Check-in</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {format(new Date(), 'EEEE, MMMM d')} · Self-awareness is the foundation of growth.
        </p>
      </div>

      {/* Global save error */}
      {saveErr && (
        <div className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{saveErr}</span>
          <button
            type="button"
            className="ml-auto text-xs underline hover:no-underline"
            onClick={() => setSaveErr(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Day complete banner */}
      {morningDone && eveningDone && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 flex items-center gap-4">
          <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
          <div>
            <p className="font-semibold text-green-600 dark:text-green-400">
              Today's check-in complete
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Energy {checkin!.morningEnergy}/5 · Clarity {checkin!.morningClarity ?? '?'}/5 · Day {checkin!.eveningRating}/5
            </p>
          </div>
        </div>
      )}

      {/* ── Morning check-in ─────────────────────────────────────────────── */}
      <CheckinSection
        title="Morning Check-in"
        subtitle="Set your energy, clarity & intention for today"
        icon={Sun}
        iconColor="bg-orange-500/10 text-orange-500"
        done={morningDone}
        doneSummary={morningSummary}
        onSubmit={saveMorning}
        saving={saving}
        canSubmit={mEnergy != null}          // energy is the one required field
        submitHint="Select an energy level to save"
      >
        <ScorePicker
          label="Energy level"
          value={mEnergy}
          onChange={setMEnergy}
          emojis={['', '😴', '😐', '🙂', '💪', '🔥']}
          descriptions={['', 'Exhausted', 'Low', 'Okay', 'Good', 'On fire']}
          required
        />
        <ScorePicker
          label="Mental clarity"
          value={mClarity}
          onChange={setMClarity}
          emojis={['', '🌫️', '😵', '🤔', '🧠', '⚡']}
          descriptions={['', 'Foggy', 'Scattered', 'Clear enough', 'Sharp', 'Laser-focused']}
        />
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Today's intention</p>
          <textarea
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            rows={2}
            placeholder="What is the one thing that will make today a win?"
            value={mIntention}
            onChange={e => setMIntention(e.target.value)}
          />
        </div>
      </CheckinSection>

      {/* ── Evening reflection — visible once morning is done OR after 5 pm ── */}
      {(morningDone || isEvening) && (
        <CheckinSection
          title="Evening Reflection"
          subtitle="Reflect on your day before you wind down"
          icon={Moon}
          iconColor="bg-violet-500/10 text-violet-500"
          done={eveningDone}
          doneSummary={eveningSummary}
          onSubmit={saveEvening}
          saving={saving}
          canSubmit={eRating != null}          // rating is the one required field
          submitHint="Select a day rating to save"
        >
          <ScorePicker
            label="How was your day?"
            value={eRating}
            onChange={setERating}
            emojis={['', '😞', '😑', '🙂', '😊', '🏆']}
            descriptions={['', 'Rough day', 'Meh', 'Decent', 'Good day', 'Crushed it']}
            required
          />
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Biggest win today</p>
            <textarea
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
              placeholder="What went well? What are you proud of?"
              value={eWins}
              onChange={e => setEWins(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Reflection / lessons</p>
            <textarea
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
              placeholder="What would you do differently? What did you learn?"
              value={eNote}
              onChange={e => setENote(e.target.value)}
            />
          </div>
        </CheckinSection>
      )}
    </div>
  )
}
