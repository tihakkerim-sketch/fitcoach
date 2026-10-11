import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mondayOf, isMonday } from '@/shared/planCalendar'
import { fmtDate } from './sessionFormat'

const VALID = /^\d{4}-\d{2}-\d{2}$/

/** Montag, auf den ein eingegebenes Datum fällt; null bei leerer/ungültiger Eingabe. */
export function effectiveStart(raw: string): string | null {
  return VALID.test(raw) ? mondayOf(raw) : null
}

interface Props {
  id: string
  value: string
  onChange: (v: string) => void
}

/** Datumsfeld für das Startdatum; Pläne beginnen immer an einem Montag. */
export function StartDateField({ id, value, onChange }: Props) {
  const eff = effectiveStart(value)
  return (
    <div className="vspace-1">
      <Label htmlFor={id}>Startdatum *</Label>
      <Input id={id} type="date" value={value} onChange={e => onChange(e.target.value)} />
      {eff && !isMonday(value) && (
        <p className="text-xs text-muted-foreground">
          Pläne beginnen am Montag. Start wird der <strong className="text-foreground">{fmtDate(eff, 'EEEE, dd.MM.yyyy')}</strong>.
        </p>
      )}
      {eff && isMonday(value) && (
        <p className="text-xs text-muted-foreground">{fmtDate(eff, 'EEEE, dd.MM.yyyy')}</p>
      )}
    </div>
  )
}
