# Lokaler KI-Coach (Ollama) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (Subagents `model: "sonnet"`). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Knopf „Lokalen Coach fragen“ schickt den Coach-Bericht an Ollama auf Kerims PC; Antwort (Erklärung + Plan-Änderungen) erscheint in der vorhandenen Übernehmen-Vorschau.

**Spec:** `docs/superpowers/specs/2026-10-20-lokaler-coach-design.md`

**Architecture:** Reine Logik ohne `electron`-Import in `electron/lib/ollama{Client,Prompt,Job}.ts` (fetch injizierbar, wie `intervalsClient.ts`). IPC in `electron/ipc/ollama.ts`. Renderer: `src/components/settings/OllamaSettings.tsx`, `src/components/coach/LocalCoachSection.tsx`; `ChangeReview` bekommt optional vorbefüllten Text.

**Tech Stack:** Electron 44, React, TypeScript, Zod 4, vitest 5, Playwright. **Kein neues npm-Paket.**

## Global Constraints
- Neuer IPC-Kanal: `IPC` in `src/types/ipc.ts` + `ipcInputs`/`IpcResults` in `src/types/ipcContract.ts` + `handle(IPC.X, fn)`.
- Einstellungen in `app_settings` über `getSetting/setSetting` (`electron/lib/appSettings.ts`), Schlüssel `ollama.enabled|url|model|lastResult`. Keine Migration nötig.
- „Heute“ nur `appToday(db)`. UI-Texte Deutsch. Nach Übernehmen `emitDataChanged()` (macht `ChangeReview` schon).
- Tests nie gegen echtes Ollama oder echte DB; E2E mit Fake-Ollama-Server.

## Review Focus
1. Ollama nicht erreichbar / Modell fehlt / Abbruch mitten im Stream → klarer Status, kein hängender Job, kein Absturz.
2. Modell liefert kaputtes JSON oder Änderungen an fremden/vergangenen Einheiten → wird verworfen bzw. in der Vorschau als Fehler markiert, nie übernommen.
3. Adresse mit Pfad, `file://`, Weiterleitung → abgelehnt.
4. Zweiter Klick während ein Job läuft → kein zweiter Job.

---

### Task 0: Messen (vor dem Bauen, auf Kerims PC)
- [ ] Kerim installiert Ollama + `qwen3:8b` (Anleitung unten, Abschnitt „Einrichtung PC“).
- [ ] Bericht der letzten 4 Wochen aus der App kopieren, Länge in Tokens grob messen (`ollama run` mit `/set verbose`).
- [ ] Ergebnis entscheidet `num_ctx` (Standard 8192; reicht der Bericht nicht → 12288, VRAM prüfen mit `nvidia-smi`).

### Task 1: Ollama-Client
**Files:** Create `electron/lib/ollamaClient.ts`, `electron/lib/ollamaClient.test.ts`
- [ ] `createOllamaClient({ baseUrl, fetch })` mit `listModels()` (`GET /api/tags`) und `chatStream({ model, messages, format, numCtx, signal, onChunk })` (`POST /api/chat`, NDJSON-Stream zeilenweise lesen, `message.content` anhängen, `done: true` beendet).
- [ ] Fehlerklasse `OllamaError(kind: 'unreachable'|'model_missing'|'http'|'format'|'timeout'|'cancelled')`; 404 mit „model … not found“ → `model_missing`.
- [ ] `redirect: 'error'`; Leerlauf-Timeout 2 min zwischen Chunks, Gesamt 15 min (AbortController).
- [ ] `normalizeOllamaUrl(s)`: nur http/https, kein Pfad/Query, Port erlaubt → sonst wirft.
- [ ] Tests mit Fake-fetch: Stream in mehreren Stücken (auch Zeile über Chunk-Grenze), 404-Modell, Netzwerkfehler, Abbruch, Leerlauf-Timeout (Fake-Timer), URL-Prüfung.

### Task 2: Prompt + Antwort-Prüfung
**Files:** Create `electron/lib/ollamaPrompt.ts`, `electron/lib/ollamaPrompt.test.ts`
- [ ] `buildLocalCoachMessages(report: string)`: System-Anweisung Deutsch (Rolle Lauf-Coach, vorsichtig, Wade/Verletzungsschutz, max. 10 %/Woche, nur Einheiten aus dem Bericht per `#id`, lieber keine Änderung als eine riskante) + `COACH_CHANGES_FORMAT` + Bericht.
- [ ] `LOCAL_COACH_SCHEMA` (JSON-Schema für Ollama `format`) und Zod-Gegenstück `localCoachAnswerSchema` = `{ explanation: string (1–2000), fitcoachChanges: { fitcoachChanges: 1, summary, changes[] } }`.
- [ ] `parseLocalCoachAnswer(raw)`: JSON lesen (auch aus ```json-Block), Zod prüfen → `{ ok, answer } | { ok:false, message }`.
- [ ] Tests: gültig, leere `changes`, Text um JSON herum, kaputtes JSON, falscher Typ.

### Task 3: Job (Hintergrund-Lauf)
**Files:** Create `electron/lib/ollamaJob.ts`, `electron/lib/ollamaJob.test.ts`
- [ ] Zustandsautomat ohne `electron`: `idle → connecting → generating(chars) → done(answer) | error(message, raw?) | cancelled`; `start(deps)` lehnt ab, wenn schon läuft; `cancel()`.
- [ ] Ablauf: Bericht bauen (Callback) → `chatStream` → `parseLocalCoachAnswer`; bei Formatfehler **ein** zweiter Versuch mit Zusatz-Nachricht „Deine Antwort war kein gültiges JSON: …“.
- [ ] Bei `done` Callback `saveResult(json)` (Main speichert in `ollama.lastResult` mit Zeitstempel + Modell).
- [ ] Tests: Erfolg, zweiter Versuch klappt, zweimal kaputt → error mit Rohtext, Doppelstart, Abbruch, nicht erreichbar.

### Task 4: IPC
**Files:** Create `electron/ipc/ollama.ts`; Modify `src/types/ipc.ts`, `src/types/ipcContract.ts`, `electron/main.ts`
- [ ] Kanäle: `OLLAMA_SETTINGS_GET`, `OLLAMA_SETTINGS_SET` ({enabled, url, model}, URL per `normalizeOllamaUrl` in Zod-`transform`), `OLLAMA_TEST` (→ Modelle mit Größe oder Fehlertext), `OLLAMA_START` ({dateFrom, dateTo} wie `summarySchema`), `OLLAMA_STATUS`, `OLLAMA_CANCEL`, `OLLAMA_LAST_RESULT`.
- [ ] `OLLAMA_START` nutzt `buildCoachReport(getDb(), appToday(getDb()), range)`; wenn deaktiviert → Fehler „Lokaler Coach ist ausgeschaltet“.
- [ ] `electron/ipc/contract.test.ts` muss grün bleiben.

### Task 5: Einstellungen-UI
**Files:** Create `src/components/settings/OllamaSettings.tsx`; Modify `src/pages/Settings.tsx`
- [ ] Abschnitt „Lokaler Coach (Ollama)“: Schalter, Adresse, „Verbindung testen“ → Modell-Auswahl (Name + GB), Speichern, Datenschutz-Hinweis aus Spec, Kurz-Anleitung mit Link-Text `ollama pull qwen3:8b`.

### Task 6: Coach-Seite
**Files:** Create `src/components/coach/LocalCoachSection.tsx`; Modify `src/pages/Coach.tsx`, `src/components/coach/ChangeReview.tsx`
- [ ] Nur sichtbar, wenn aktiviert. Zeitraum-Felder (wie `ReportSection`), Knopf „Lokalen Coach fragen“, Status mit Zeichenzähler + vergangener Zeit, „Abbrechen“.
- [ ] Ergebnis: Erklärung als Textkarte (`whitespace-pre-wrap`, kein HTML) + Modell/Zeitpunkt; Änderungen → `ChangeReview` per neuer Prop `initialText` (setzt Textarea + startet Vorschau automatisch).
- [ ] Beim Öffnen der Seite `OLLAMA_STATUS` + `OLLAMA_LAST_RESULT` laden (läuft weiter nach Seitenwechsel).

### Task 7: E2E mit Fake-Ollama
**Files:** Create `e2e/localCoach.spec.ts`, `e2e/fakeOllama.ts`
- [ ] Node-`http`-Server auf freiem Port: `/api/tags` + `/api/chat` streamt eine feste Antwort (1 Änderung an einer Einheit des Test-Plans) in 3 Stücken mit kleinen Pausen.
- [ ] Ablauf: Profil + Plan per invoke → Einstellungen: Adresse setzen, testen, Modell wählen → Coach: fragen → Erklärung sichtbar → Vorschau zeigt Änderung → Übernehmen → Einheit geändert.
- [ ] Zweiter Test: Server liefert kaputtes JSON → Fehlertext sichtbar, nichts geändert.

### Task 8: Doku + Abschluss
- [ ] `CLAUDE.md` Gotchas (Ollama-Schlüssel in `app_settings`, Fake-Server in E2E), `docs/AUDIT-2026-10.md` §8 Entscheidung aktualisieren, `docs/BACKLOG.md`.
- [ ] Typechecks, `npx vitest run`, `npm run build`, `npx playwright test` grün → Version erhöhen → Release (Tag pusht Kerim).
- [ ] Echter Test auf dem PC mit `qwen3:8b` und Kopie der DB: Dauer messen, Qualität der Vorschläge ansehen.

---

## Einrichtung PC (Kerim, einmalig, ~15 min + Download)
1. Auf dem PC prüfen: mindestens **15 GB frei** auf C: (RTX 4060, 8 GB VRAM → `qwen3:8b`).
2. Konsole öffnen: `winget install Ollama.Ollama`
3. `ollama pull qwen3:8b` (lädt ~5,2 GB).
4. Test: `ollama run qwen3:8b "Sag Hallo auf Deutsch"` → Antwort kommt.
5. Nur wenn FitCoach auf dem **Laptop** läuft: Windows-Umgebungsvariable `OLLAMA_HOST` = `0.0.0.0` setzen, Ollama neu starten, in der Windows-Firewall Port 11434 für **private Netzwerke** freigeben; im Laptop-FitCoach Adresse `http://<PC-Name>:11434` eintragen.
6. Platz zurückholen: `ollama rm qwen3:8b` (Modell) bzw. Ollama deinstallieren.
