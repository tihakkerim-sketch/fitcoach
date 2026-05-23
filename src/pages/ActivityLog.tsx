import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ActivityCard } from '@/components/activities/ActivityCard'
import { ActivityFilters as ActivityFilterBar } from '@/components/activities/ActivityFilters'
import { GarminDropZone } from '@/components/activities/GarminDropZone'
import { LogActivityModal } from '@/components/activities/LogActivityModal'
import { useActivities } from '@/hooks/useActivities'
import type { CreateActivityPayload } from '@/types/ipc'

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
  const [garminPrefill, setGarminPrefill] = useState<Partial<CreateActivityPayload> | undefined>()

  const handleGarminParsed = (data: Partial<CreateActivityPayload>) => {
    setGarminPrefill(data)
    setModalOpen(true)
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setGarminPrefill(undefined)
  }

  return (
    <div className="flex flex-col gap-4 h-full p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Activity Log</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'activity' : 'activities'} recorded
          </p>
        </div>
        <Button onClick={() => { setGarminPrefill(undefined); setModalOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Log Activity
        </Button>
      </div>

      {/* Garmin drop zone */}
      <GarminDropZone onParsed={handleGarminParsed} />

      {/* Filters */}
      <ActivityFilterBar filters={filters} onApply={applyFilters} />

      {/* Activity list */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Loading…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-destructive">
            {error}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <p>No activities found.</p>
            <Button variant="outline" size="sm" onClick={() => { setGarminPrefill(undefined); setModalOpen(true) }}>
              Log your first activity
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-2 pr-2">
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
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={prevPage} disabled={!hasPrev}>
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={nextPage} disabled={!hasNext}>
              Next
            </Button>
          </div>
        </div>
      )}

      <LogActivityModal
        open={modalOpen}
        onClose={handleModalClose}
        onSaved={refresh}
        prefill={garminPrefill}
      />
    </div>
  )
}
