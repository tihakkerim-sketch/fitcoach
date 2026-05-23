import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { SessionRow, SessionStatus, ActivityRow } from '@/types/ipc'

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  session: SessionRow | null
  onClose: () => void
  onSaved: () => void
}

export function SessionActionModal({ session, onClose, onSaved }: Props) {
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [linkedId, setLinkedId] = useState<string>('_none')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    setLinkedId(session.linkedActivityId ? String(session.linkedActivityId) : '_none')
    invoke<{ activities: ActivityRow[]; total: number }>(IPC.ACTIVITIES_LIST, { limit: 100 })
      .then(r => setActivities(r.activities))
      .catch(() => setActivities([]))
  }, [session])

  if (!session) return null

  const markStatus = async (status: SessionStatus) => {
    setSaving(true)
    setError(null)
    try {
      await invoke(IPC.SESSIONS_UPDATE_STATUS, {
        sessionId: session.id,
        status,
        completedAt: status === 'completed' ? Date.now() : undefined,
      })
      if (status === 'completed' && linkedId !== '_none') {
        await invoke(IPC.SESSIONS_LINK_ACTIVITY, {
          sessionId: session.id,
          activityId: Number(linkedId),
        })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update session')
    } finally {
      setSaving(false)
    }
  }

  const saveLink = async () => {
    setSaving(true)
    setError(null)
    try {
      await invoke(IPC.SESSIONS_LINK_ACTIVITY, {
        sessionId: session.id,
        activityId: linkedId !== '_none' ? Number(linkedId) : null,
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link activity')
    } finally {
      setSaving(false)
    }
  }

  const statusColor: Record<SessionStatus, string> = {
    planned: 'secondary',
    completed: 'default',
    skipped: 'outline',
  }

  return (
    <Dialog open={!!session} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {DAY_NAMES[session.dayOfWeek]} — {session.type.charAt(0).toUpperCase() + session.type.slice(1)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Session details */}
          <div className="rounded-md bg-muted/50 p-3 space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              <Badge variant={statusColor[session.status] as any}>{session.status}</Badge>
            </div>
            {session.targetDurationMin && (
              <div><span className="text-muted-foreground">Target:</span> {session.targetDurationMin} min</div>
            )}
            {session.targetHrZone && (
              <div><span className="text-muted-foreground">HR Zone:</span> Z{session.targetHrZone}</div>
            )}
            {session.intensityLabel && (
              <div><span className="text-muted-foreground">Intensity:</span> {session.intensityLabel}</div>
            )}
            {session.coachingNote && (
              <div><span className="text-muted-foreground">Coaching:</span> {session.coachingNote}</div>
            )}
            {session.completionNote && (
              <div className="pt-1 border-t border-border/50">
                <span className="text-muted-foreground">Your note:</span>{' '}
                <span className="italic">{session.completionNote}</span>
              </div>
            )}
          </div>

          {/* Link to activity */}
          <div className="space-y-1">
            <Label>Link to logged activity</Label>
            <Select value={linkedId} onValueChange={setLinkedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select activity…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— None —</SelectItem>
                {activities.map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.date} · {a.type}{a.durationMin ? ` · ${a.durationMin} min` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {session.status !== 'completed' && (
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => markStatus('completed')}
              disabled={saving}
            >
              Mark Completed
            </Button>
          )}
          {session.status !== 'skipped' && (
            <Button variant="outline" onClick={() => markStatus('skipped')} disabled={saving}>
              Mark Skipped
            </Button>
          )}
          {session.status !== 'planned' && (
            <Button variant="ghost" onClick={() => markStatus('planned')} disabled={saving}>
              Reset to Planned
            </Button>
          )}
          <Button variant="outline" onClick={saveLink} disabled={saving}>
            Save Link
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
