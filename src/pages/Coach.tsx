import { CoachStatusTiles } from '@/components/coach/CoachStatusTiles'
import { LoadChart } from '@/components/coach/LoadChart'
import { WarningsCard } from '@/components/coach/WarningsCard'
import { PrognosisCard } from '@/components/coach/PrognosisCard'
import { RecoveryTrendCard } from '@/components/coach/RecoveryTrendCard'
import { ReportSection } from '@/components/coach/ReportSection'
import { ChangeReview } from '@/components/coach/ChangeReview'
import { useCoachStatus } from '@/hooks/useCoachStatus'

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
  const { status, error, loading } = useCoachStatus()
  const r = status?.recovery
  const hasRecovery = !!r && [r.hrvToday, r.hrv30, r.rhr7, r.rhr30, r.sleep7, r.sleep30].some(v => v != null)

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
      <Section title="Antwort von Claude einfügen"><ChangeReview /></Section>
    </div>
  )
}
