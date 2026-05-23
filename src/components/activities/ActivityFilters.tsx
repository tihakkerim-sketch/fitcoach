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
  { value: '', label: 'All types' },
  { value: 'running', label: 'Running' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'strength', label: 'Strength' },
  { value: 'custom', label: 'Custom' },
]

export function ActivityFilters({ filters, onApply }: Props) {
  const [type, setType] = useState<ActivityType | ''>(filters.type ?? '')
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(filters.dateTo ?? '')
  const [source, setSource] = useState<'manual' | 'garmin_import' | ''>(
    (filters.source as 'manual' | 'garmin_import' | '') ?? ''
  )

  const apply = () => {
    onApply({
      type: type || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      source: (source || undefined) as 'manual' | 'garmin_import' | undefined,
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
      <div className="space-y-1">
        <Label className="text-xs">Type</Label>
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

      <div className="space-y-1">
        <Label className="text-xs">From</Label>
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">To</Label>
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Source</Label>
        <Select value={source || '_any'} onValueChange={v => setSource(v === '_any' ? '' : v as 'manual' | 'garmin_import')}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_any">Any source</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="garmin_import">Garmin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="h-8" onClick={apply}>
          <Search className="h-3.5 w-3.5 mr-1" />
          Apply
        </Button>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-8" onClick={reset}>
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
