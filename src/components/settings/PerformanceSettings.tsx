import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import { emitDataChanged } from '@/lib/dataEvents'
import { formatRaceTime, parseRaceTime } from '@/lib/raceTime'

const DISTANCES = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.0975, label: 'Halbmarathon' },
] as const

/** Einstellungen → Leistung (aktuelle 10-km-Zeit, steuert alle Tempo-Ziele). */
export function PerformanceSettings() {
  const [km, setKm] = useState<5 | 10 | 21.0975>(10)
  const [time, setTime] = useState('')
  const [current, setCurrent] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    invoke(IPC.ADAPT_PACE_STATUS).then(s => setCurrent(s.current10kSec)).catch(() => setCurrent(null))
  }, [])

  const save = async () => {
    const sec = parseRaceTime(time)
    if (sec === null || sec < 600 || sec > 14400) {
      setMsg({ ok: false, text: 'Bitte die Zeit als mm:ss oder h:mm:ss eingeben (10 min bis 4 h).' })
      return
    }
    try {
      const r = await invoke(IPC.ADAPT_SET_PERFORMANCE, { distanceKm: km, timeSec: sec })
      setCurrent(r.current10kSec)
      setTime('')
      setMsg({
        ok: true,
        text: `Gespeichert: 10 km in ${formatRaceTime(r.current10kSec)}${r.scaled ? ` · ${r.scaled} Tempo-Ziele angepasst` : ''}.`,
      })
      emitDataChanged()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Speichern fehlgeschlagen.' })
    }
  }

  return (
    <section className="vspace-3">
      <h2 className="font-semibold">Leistung</h2>
      <p className="text-sm text-muted-foreground">
        Was du <strong>heute</strong> laufen könntest – nicht dein Ziel. Daraus richten sich alle Tempo-Ziele im Plan.
        {current != null && <> Aktuell: 10 km in {formatRaceTime(current)}.</>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {DISTANCES.map(d => (
          <Button key={d.km} size="sm" variant={km === d.km ? 'default' : 'outline'} onClick={() => setKm(d.km)}>{d.label}</Button>
        ))}
        <Input
          className="w-32" placeholder={km === 21.0975 ? 'h:mm:ss' : 'mm:ss'} value={time}
          onChange={e => setTime(e.target.value)} aria-label="Zeit"
        />
        <Button size="sm" onClick={() => void save()} disabled={!time.trim()}>
          <Check className="h-4 w-4 mr-1" /> Speichern
        </Button>
      </div>
      {msg && <p className={msg.ok ? 'text-sm text-emerald-600 dark:text-emerald-400' : 'text-sm text-destructive'}>{msg.text}</p>}
    </section>
  )
}
