import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { ActivityRow, ActivityType, ActivitySource } from '@/types/ipc'

export interface ActivityFilters {
  type?: ActivityType
  dateFrom?: string
  dateTo?: string
  source?: ActivitySource
}

const PAGE_SIZE = 20

export function useActivities() {
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<ActivityFilters>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (currentPage: number, currentFilters: ActivityFilters) => {
    setLoading(true)
    setError(null)
    try {
      const result = await invoke<{ activities: ActivityRow[]; total: number }>(IPC.ACTIVITIES_LIST, {
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE,
        ...currentFilters,
      })
      setActivities(result.activities)
      setTotal(result.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activities')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(page, filters)
  }, [page, filters, load])

  const refresh = useCallback(() => load(page, filters), [page, filters, load])

  const applyFilters = useCallback((newFilters: ActivityFilters) => {
    setPage(0)
    setFilters(newFilters)
  }, [])

  const nextPage = useCallback(() => {
    if ((page + 1) * PAGE_SIZE < total) setPage(p => p + 1)
  }, [page, total])

  const prevPage = useCallback(() => {
    if (page > 0) setPage(p => p - 1)
  }, [page])

  return {
    activities,
    total,
    page,
    pageSize: PAGE_SIZE,
    filters,
    loading,
    error,
    refresh,
    applyFilters,
    nextPage,
    prevPage,
    hasNext: (page + 1) * PAGE_SIZE < total,
    hasPrev: page > 0,
  }
}
