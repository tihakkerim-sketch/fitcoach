import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToastItem {
  id: string
  message: string
  undoLabel?: string
  onUndo?: () => void
  duration: number
}

interface ToastContextValue {
  toasts: ToastItem[]
  toast: (item: Omit<ToastItem, 'id'>) => string   // returns id
  dismiss: (id: string) => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts(ts => ts.filter(t => t.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const toast = useCallback((item: Omit<ToastItem, 'id'>): string => {
    const id = Math.random().toString(36).slice(2, 9)
    const duration = item.duration ?? 5000
    setToasts(ts => [...ts.slice(-4), { ...item, id, duration }]) // max 5 toasts
    const timer = setTimeout(() => {
      setToasts(ts => ts.filter(t => t.id !== id))
      timers.current.delete(id)
    }, duration)
    timers.current.set(id, timer)
    return id
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}
