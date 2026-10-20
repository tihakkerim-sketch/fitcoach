import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { invoke } from '@/lib/ipc'
import { IPC } from '@/types/ipc'
import type { OllamaSettings as Settings } from '@/types/ipc'

type Model = { name: string; sizeGb: number }

const gb = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

export function OllamaSettings() {
  const [s, setS] = useState<Settings | null>(null)
  const [models, setModels] = useState<Model[]>([])
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    invoke(IPC.OLLAMA_SETTINGS_GET).then(v => { if (alive) setS(v) }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!s) return null

  const test = async () => {
    setTesting(true); setMsg(null)
    try {
      const res = await invoke(IPC.OLLAMA_TEST, { url: s.url })
      setModels(res.models)
      setMsg({
        ok: true,
        text: res.models.length === 0
          ? 'Verbunden, aber kein Modell installiert. Auf dem PC: ollama pull qwen3:8b'
          : `Verbunden. ${res.models.length} Modell(e) gefunden.`,
      })
      if (res.models.length > 0 && !s.model) {
        setS({ ...s, model: res.models[0].name })
      }
    } catch (e) {
      setMsg({ ok: false, text: errText(e, 'Verbindung fehlgeschlagen.') })
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      await invoke(IPC.OLLAMA_SETTINGS_SET, s)
      setMsg({ ok: true, text: 'Gespeichert.' })
    } catch (e) {
      setMsg({ ok: false, text: errText(e, 'Speichern fehlgeschlagen.') })
    } finally {
      setSaving(false)
    }
  }

  // Gespeichertes Modell bleibt auswählbar, auch wenn es nicht in der Testliste ist
  const options: Model[] = models.some(m => m.name === s.model) || !s.model
    ? models
    : [{ name: s.model, sizeGb: -1 }, ...models]

  return (
    <section className="vspace-3">
      <h2 className="font-semibold">Lokaler Coach (Ollama)</h2>
      <Separator />
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label>Lokalen Coach aktivieren</Label>
          <p className="text-xs text-muted-foreground">
            Zeigt auf der Coach-Seite einen Knopf, der den Bericht an ein lokales KI-Modell schickt.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={s.enabled}
          aria-label="Lokalen Coach aktivieren"
          onClick={() => setS({ ...s, enabled: !s.enabled })}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${s.enabled ? 'bg-primary' : 'bg-input'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-background shadow-sm transition-transform ${s.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <div className="vspace-1">
        <Label htmlFor="ollama-url">Adresse des Ollama-Servers</Label>
        <Input id="ollama-url" value={s.url} onChange={e => setS({ ...s, url: e.target.value })} placeholder="http://localhost:11434" />
        <p className="text-xs text-muted-foreground">
          Der Bericht (Läufe, Puls, Erholung) wird an diese Adresse geschickt. Nur eigene Geräte eintragen.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={test} disabled={testing || !s.url.trim()}>
          {testing ? 'Teste …' : 'Verbindung testen'}
        </Button>
      </div>

      <div className="vspace-1">
        <Label htmlFor="ollama-model">Modell</Label>
        {options.length > 0 ? (
          <select
            id="ollama-model"
            value={s.model}
            onChange={e => setS({ ...s, model: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {options.map(m => (
              <option key={m.name} value={m.name}>
                {m.sizeGb >= 0 ? `${m.name} (${gb(m.sizeGb)} GB)` : m.name}
              </option>
            ))}
          </select>
        ) : (
          <Input id="ollama-model" value={s.model} onChange={e => setS({ ...s, model: e.target.value })} />
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Ollama auf dem PC installieren, dann im Terminal <code className="rounded bg-muted px-1">ollama pull qwen3:8b</code> ausführen.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <Button size="sm" onClick={save} disabled={saving}>Speichern</Button>
        {msg && (
          <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{msg.text}</p>
        )}
      </div>
    </section>
  )
}
