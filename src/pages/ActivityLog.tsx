import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ActivityCard } from '@/components/activities/ActivityCard'
import { ActivityFilters as ActivityFilterBar } from '@/components/activities/ActivityFilters'
import { GarminDropZone } from '@/components/activities/GarminDropZone'
import { IntervalsSyncBar } from '@/components/activities/IntervalsSyncBar'
import { LogActivityModal } from '@/components/activities/LogActivityModal'
import { useActivities } from '@/hooks/useActivities'
import { invoke } from '@/lib/ipc'
import { onDataChanged } from '@/lib/dataEvents'
import { IPC } from '@/types/ipc'
import type { Shoe } from '@/types/ipc'

export default function ActivityLog() {
  const {
    activities,
    total,
    page,
    pageSize,
    filters,
    loading,
    error,
    refresh,
    applyFilters,
    nextPage,
    prevPage,
    hasNext,
    hasPrev,
  } = useActivities()

  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [shoes, setShoes] = useState<Shoe[]>([])
  const shoeNames = useMemo(() => new Map(shoes.map(x => [x.id, x.name])), [shoes])

  useEffect(() => {
    const load = () => { invoke(IPC.SHOES_LIST).then(setShoes).catch(() => setShoes([])) }
    load()
    return onDataChanged(load)
  }, [])

  const hasFilters = !!(filters.type || filters.dateFrom || filters.dateTo || filters.source)
  const handleModalClose = () => {
    setModalOpen(false)
  }

  return (
    <div className="flex flex-col gap-4 h-full p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Aktivitäten</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'Aktivität' : 'Aktivitäten'}
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Aktivität erfassen
        </Button>
      </div>

      <IntervalsSyncBar />

      {/* Datei-Import (meldet Änderungen per Daten-Event) */}
      <GarminDropZone />

      {/* Filters */}
      <ActivityFilterBar filters={filters} onApply={applyFilters} />

      {/* Activity list */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Lädt …
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-destructive">
            {error}
          </div>
        ) : activities.length === 0 ? (
          hasFilters ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
              <p>Mit diesen Filtern gibt es keine Aktivitäten.</p>
              <Button variant="outline" size="sm" onClick={() => applyFilters({})}>
                Filter zurücksetzen
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground">
              <p className="font-medium text-foreground">Noch keine Aktivitäten</p>
              <p className="max-w-md text-sm">
                Hier erscheinen deine Läufe, Radfahrten und mehr. Trag eine Aktivität von Hand ein,
                ziehe oben eine Garmin-Datei (.fit / .tcx) in das Feld oder verbinde intervals.icu
                in den Einstellungen, dann kommen deine Aktivitäten automatisch.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Lauf eintragen
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate('/settings')}>
                  intervals.icu verbinden
                </Button>
              </div>
            </div>
          )
        ) : (
          <ScrollArea className="h-full">
            <div className="vspace-2 pr-2">
              {activities.map(a => (
                <ActivityCard key={a.id} activity={a} onChanged={refresh} shoeName={a.shoeId != null ? shoeNames.get(a.shoeId) : undefined} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground shrink-0">
          <span>
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} von {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={prevPage} disabled={!hasPrev}>
              Zurück
            </Button>
            <Button variant="outline" size="sm" onClick={nextPage} disabled={!hasNext}>
              Weiter
            </Button>
          </div>
        </div>
      )}

      <LogActivityModal
        open={modalOpen}
        onClose={handleModalClose}
        onSaved={refresh}
      />
    </div>
  )
}
