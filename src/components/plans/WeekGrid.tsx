import { useState } from 'react'
import { SessionActionModal } from './SessionActionModal'
import type { PhaseDetail, SessionRow, SessionStatus } from '@/types/ipc'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const STATUS_STYLES: Record<SessionStatus, string> = {
  planned:   'border-border bg-card hover:border-primary cursor-pointer',
  completed: 'border-green-500 bg-green-50 dark:bg-green-950 hover:border-green-600 cursor-pointer',
  skipped:   'border-dashed border-muted-foreground/40 bg-muted/30 opacity-60 cursor-pointer',
}

const TYPE_DOT: Record<string, string> = {
  running:  'bg-blue-500',
  cycling:  'bg-green-500',
  strength: 'bg-orange-500',
  rest:     'bg-gray-400',
  custom:   'bg-purple-500',
}

interface SessionCellProps {
  session: SessionRow
  onClick: (s: SessionRow) => void
}

function SessionCell({ session, onClick }: SessionCellProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(session)}
      className={`w-full rounded-md border p-1.5 text-left transition-colors ${STATUS_STYLES[session.status]}`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <span className={`h-2 w-2 rounded-full shrink-0 ${TYPE_DOT[session.type] ?? TYPE_DOT.custom}`} />
        <span className="text-xs font-medium truncate capitalize">{session.type}</span>
      </div>
      {session.targetDurationMin && (
        <p className="text-[11px] text-muted-foreground">{session.targetDurationMin} min</p>
      )}
      {session.targetHrZone && (
        <p className="text-[11px] text-muted-foreground">Z{session.targetHrZone}</p>
      )}
      {session.intensityLabel && (
        <p className="text-[11px] text-muted-foreground truncate">{session.intensityLabel}</p>
      )}
    </button>
  )
}

interface Props {
  phases: PhaseDetail[]
  onSessionUpdated: () => void
}

export function WeekGrid({ phases, onSessionUpdated }: Props) {
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null)

  return (
    <>
      <div className="space-y-6">
        {phases.map(phase => (
          <div key={phase.id}>
            {/* Phase header */}
            <div className="flex items-center gap-3 mb-3">
              <h3 className="font-semibold text-sm">{phase.name}</h3>
              <span className="text-xs text-muted-foreground">{phase.durationWeeks} week{phase.durationWeeks !== 1 ? 's' : ''}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Week rows */}
            <div className="space-y-2">
              {/* Day header */}
              <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-1.5">
                <div />
                {DAYS.map(d => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>

              {phase.weeks.map(week => {
                // Map sessions by dayOfWeek (1=Mon … 7=Sun)
                const byDay: Record<number, SessionRow[]> = {}
                for (const s of week.sessions) {
                  if (!byDay[s.dayOfWeek]) byDay[s.dayOfWeek] = []
                  byDay[s.dayOfWeek].push(s)
                }

                return (
                  <div key={week.id} className="grid grid-cols-[56px_repeat(7,1fr)] gap-1.5 items-start">
                    <div className="flex items-center justify-center text-xs font-medium text-muted-foreground pt-2">
                      W{week.weekNumber}
                    </div>
                    {[1, 2, 3, 4, 5, 6, 7].map(day => (
                      <div key={day} className="min-h-[52px] space-y-1">
                        {(byDay[day] ?? []).map(s => (
                          <SessionCell key={s.id} session={s} onClick={setActiveSession} />
                        ))}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <SessionActionModal
        session={activeSession}
        onClose={() => setActiveSession(null)}
        onSaved={() => { setActiveSession(null); onSessionUpdated() }}
      />
    </>
  )
}
