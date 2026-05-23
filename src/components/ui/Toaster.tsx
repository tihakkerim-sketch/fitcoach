import { X } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { cn } from '@/lib/utils'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-80">
      {toasts.map(t => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-3 rounded-xl border bg-card px-4 py-3',
            'shadow-lg shadow-black/10 dark:shadow-black/30',
            'animate-in slide-in-from-bottom-3 fade-in duration-200',
          )}
        >
          {/* Progress bar */}
          <span
            className="absolute bottom-0 left-0 h-0.5 rounded-full bg-primary/40"
            style={{ animation: `shrink ${t.duration}ms linear forwards` }}
          />

          <p className="flex-1 text-sm font-medium">{t.message}</p>

          {t.onUndo && (
            <button
              onClick={() => { t.onUndo!(); dismiss(t.id) }}
              className="text-xs font-bold text-primary hover:text-primary/80 transition-colors shrink-0"
            >
              {t.undoLabel ?? 'Undo'}
            </button>
          )}

          <button
            onClick={() => dismiss(t.id)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  )
}
