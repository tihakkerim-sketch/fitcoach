import { useEffect, useState } from 'react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import { cn } from '@/lib/utils'

const FEELINGS = [
  { value: 1, emoji: '😫', label: 'Sehr schlecht' },
  { value: 2, emoji: '😕', label: 'Eher schlecht' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Gut' },
  { value: 5, emoji: '😄', label: 'Sehr gut' },
] as const

interface Props {
  date: string
  /** aktueller Wert (1–5) oder null/undefined */
  value?: number | null
  title?: string
  onChanged?: (feeling: number | null) => void
}

export function FeelingPicker({ date, value, title = 'Wie fühlst du dich heute?', onChanged }: Props) {
  const [current, setCurrent] = useState<number | null>(value ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setCurrent(value ?? null) }, [value, date])

  const pick = async (v: number) => {
    if (busy) return
    const next = current === v ? null : v
    const prev = current
    setCurrent(next)
    setBusy(true)
    try {
      await invoke(IPC.RECOVERY_SET_FEELING, { date, feeling: next })
      onChanged?.(next)
    } catch {
      setCurrent(prev)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm font-semibold mb-3">{title}</p>
      <div className="flex gap-2">
        {FEELINGS.map(f => (
          <button
            key={f.value}
            type="button"
            title={f.label}
            aria-label={f.label}
            aria-pressed={current === f.value}
            onClick={() => void pick(f.value)}
            className={cn(
              'flex-1 rounded-lg border py-2 text-2xl transition-all',
              current === f.value
                ? 'border-primary bg-primary/10 scale-105'
                : 'border-border hover:bg-muted opacity-70 hover:opacity-100',
            )}
          >
            {f.emoji}
          </button>
        ))}
      </div>
      {current != null && (
        <p className="text-xs text-muted-foreground mt-2">
          {FEELINGS.find(f => f.value === current)?.label} – nochmal tippen zum Entfernen
        </p>
      )}
    </div>
  )
}

export function feelingEmoji(v: number | null | undefined): string | null {
  return FEELINGS.find(f => f.value === v)?.emoji ?? null
}
