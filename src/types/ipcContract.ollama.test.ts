import { describe, it, expect } from 'vitest'
import { IPC } from './ipc'
import { ipcInputs } from './ipcContract'

const ok = (ch: keyof typeof ipcInputs, v: unknown) => ipcInputs[ch].safeParse(v).success

describe('Lokaler Coach: Eingaben', () => {
  const base = { enabled: true, url: 'http://localhost:11434', model: 'qwen3:8b' }
  it('URL wird normalisiert', () => {
    const r = ipcInputs[IPC.OLLAMA_SETTINGS_SET].parse({ ...base, url: ' http://192.168.1.5:11434/ ' })
    expect(r.url).toBe('http://192.168.1.5:11434')
    expect(ipcInputs[IPC.OLLAMA_TEST].parse({ url: 'https://pc.local/' }).url).toBe('https://pc.local')
  })
  it('Pfad, file:// und Müll werden abgelehnt (deutsche Meldung)', () => {
    for (const url of ['http://x:11434/api', 'file:///c:/x', 'ftp://x', 'nope', '', 'http://u:p@x']) {
      expect(ok(IPC.OLLAMA_SETTINGS_SET, { ...base, url }), url).toBe(false)
      expect(ok(IPC.OLLAMA_TEST, { url }), url).toBe(false)
    }
    const res = ipcInputs[IPC.OLLAMA_TEST].safeParse({ url: 'file:///x' })
    expect(res.success ? '' : res.error.issues[0].message).toContain('http')
  })
  it('Modellname: sicherer Zeichensatz', () => {
    expect(ok(IPC.OLLAMA_SETTINGS_SET, { ...base, model: 'hf.co/user/model:Q4_K_M' })).toBe(true)
    for (const model of ['', '   ', 'a b', 'x;rm', 'a'.repeat(101), 'x\ny']) {
      expect(ok(IPC.OLLAMA_SETTINGS_SET, { ...base, model }), model).toBe(false)
    }
    expect(ok(IPC.OLLAMA_SETTINGS_SET, { ...base, enabled: 'yes' })).toBe(false)
  })
  it('Start nimmt Zeitraum, Rest keine Eingabe', () => {
    expect(ok(IPC.OLLAMA_START, { dateFrom: '2026-10-01', dateTo: '2026-10-20' })).toBe(true)
    expect(ok(IPC.OLLAMA_START, { dateFrom: 'x', dateTo: '2026-10-20' })).toBe(false)
    for (const c of [IPC.OLLAMA_SETTINGS_GET, IPC.OLLAMA_STATUS, IPC.OLLAMA_CANCEL, IPC.OLLAMA_LAST_RESULT]) {
      expect(ok(c, undefined)).toBe(true)
      expect(ok(c, { x: 1 })).toBe(false)
    }
  })
})
