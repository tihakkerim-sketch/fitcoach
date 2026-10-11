import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ActivityCard } from '@/components/activities/ActivityCard'
import { ActivityFilters as ActivityFilterBar } from '@/components/activities/ActivityFilters'
import { GarminDropZone } from '@/components/activities/GarminDropZone'
import { IntervalsSyncBar } from '@/components/activities/IntervalsSyncBar'
import { LogActivityModal } from '@/components/activities/LogActivityModal'
import { useActivities } from '@/hooks/useActivities'

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

  const [modalOpen, setModalOpen] = useState(false)
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

      {/* Garmin drop zone (meldet Änderungen per Daten-Event) */}
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
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <p>Keine Aktivitäten gefunden.</p>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
              Erste Aktivität erfassen
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="vspace-2 pr-2">
              {activities.map(a => (
                <ActivityCard key={a.id} activity={a} onDeleted={refresh} />
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
