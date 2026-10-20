import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { CoachStatusTiles } from '@/components/coach/CoachStatusTiles'
import { LoadChart } from '@/components/coach/LoadChart'
import { WarningsCard } from '@/components/coach/WarningsCard'
import { PrognosisCard } from '@/components/coach/PrognosisCard'
import { RecoveryTrendCard } from '@/components/coach/RecoveryTrendCard'
import { ReportSection } from '@/components/coach/ReportSection'
import { LocalCoachSection } from '@/components/coach/LocalCoachSection'
import { ChangeReview } from '@/components/coach/ChangeReview'
import { useCoachStatus } from '@/hooks/useCoachStatus'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="vspace-3">
      <div className="flex items-center gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">{title}</h2>
        <div className="flex-1 h-px bg-border/60" />
      </div>
      {children}
    </section>
  )
}

export default function Coach() {
  const navigate = useNavigate()
  const [localEnabled, setLocalEnabled] = useState(false)
  useEffect(() => {
    let alive = true
    invoke(IPC.OLLAMA_SETTINGS_GET).then(s => { if (alive) setLocalEnabled(s.enabled) }).catch(() => {})
    return () => { alive = false }
  }, [])
  const { status, error, loading } = useCoachStatus()
  const r = status?.recovery
  const hasRecovery = !!r && [r.hrvToday, r.hrv30, r.rhr7, r.rhr30, r.sleep7, r.sleep30].some(v => v != null)

  const noData = !!status && status.series.every(p => p.load === 0) && status.ramp.last7Km === 0 && status.ramp.avgWeekKmPrev28 === 0

  return (
    <div className="p-6 max-w-4xl vspace-8">
      <div>
        <h1 className="text-2xl font-bold">Coach</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Belastung, Warnungen und Prognose – und der Austausch mit Claude über deinen Trainingsplan.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && !status && <p className="text-sm text-muted-foreground">Lade…</p>}

      {noData && (
        <div className="rounded-lg border bg-card p-4 vspace-2">
          <p className="font-semibold text-sm">Noch zu wenig Daten für den Coach</p>
          <p className="text-sm text-muted-foreground">
            In den letzten Wochen gibt es keine Läufe. Damit der Coach rechnen kann, braucht er Läufe mit Puls
            (Import oder intervals.icu), deinen Max- und Ruhepuls im Profil und eine Zielzeit.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>Zu den Einstellungen</Button>
        </div>
      )}

      {status && (
        <>
          <Section title="Status">
            <CoachStatusTiles status={status} />
            <LoadChart series={status.series} />
          </Section>
          <Section title="Warnungen"><WarningsCard ramp={status.ramp} /></Section>
          <Section title="Prognose"><PrognosisCard prognosis={status.prognosis} /></Section>
          {hasRecovery && r && <Section title="Recovery-Trend"><RecoveryTrendCard r={r} /></Section>}
        </>
      )}

      <Section title="Coach-Bericht für Claude"><ReportSection /></Section>
      {localEnabled && <Section title="Lokaler Coach"><LocalCoachSection /></Section>}
      <Section title="Antwort von Claude einfügen"><ChangeReview /></Section>
    </div>
  )
}
