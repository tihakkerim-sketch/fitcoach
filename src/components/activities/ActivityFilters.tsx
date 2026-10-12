import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { ActivityFilters } from '@/hooks/useActivities'
import type { ActivityType } from '@/types/ipc'

interface Props {
  filters: ActivityFilters
  onApply: (f: ActivityFilters) => void
}

const TYPES: { value: ActivityType | ''; label: string }[] = [
  { value: '', label: 'Alle Typen' },
  { value: 'running', label: 'Laufen' },
  { value: 'cycling', label: 'Radfahren' },
  { value: 'sleep', label: 'Schlaf' },
  { value: 'strength', label: 'Kraft' },
  { value: 'custom', label: 'Sonstiges' },
]

export function ActivityFilters({ filters, onApply }: Props) {
  const [type, setType] = useState<ActivityType | ''>(filters.type ?? '')
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(filters.dateTo ?? '')
  const [source, setSource] = useState<'manual' | 'garmin_import' | 'intervals_icu' | ''>(
    (filters.source as 'manual' | 'garmin_import' | 'intervals_icu' | '') ?? ''
  )

  const apply = () => {
    onApply({
      type: type || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      source: (source || undefined) as 'manual' | 'garmin_import' | 'intervals_icu' | undefined,
    })
  }

  const reset = () => {
    setType('')
    setDateFrom('')
    setDateTo('')
    setSource('')
    onApply({})
  }

  const hasFilters = !!(type || dateFrom || dateTo || source)

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      <div className="vspace-1">
        <Label className="text-xs">Typ</Label>
        <Select value={type || '_all'} onValueChange={v => setType(v === '_all' ? '' : v as ActivityType)}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map(t => (
              <SelectItem key={t.value || '_all'} value={t.value || '_all'}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="vspace-1">
        <Label className="text-xs">Von</Label>
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
        />
      </div>

      <div className="vspace-1">
        <Label className="text-xs">Bis</Label>
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
        />
      </div>

      <div className="vspace-1">
        <Label className="text-xs">Quelle</Label>
        <Select value={source || '_any'} onValueChange={v => setSource(v === '_any' ? '' : v as 'manual' | 'garmin_import' | 'intervals_icu')}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_any">Alle Quellen</SelectItem>
            <SelectItem value="manual">Manuell</SelectItem>
            <SelectItem value="garmin_import">Datei-Import</SelectItem>
            <SelectItem value="intervals_icu">intervals.icu</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="h-8" onClick={apply}>
          <Search className="h-3.5 w-3.5 mr-1" />
          Anwenden
        </Button>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-8" onClick={reset}>
            <X className="h-3.5 w-3.5 mr-1" />
            Zurücksetzen
          </Button>
        )}
      </div>
    </div>
  )
}
