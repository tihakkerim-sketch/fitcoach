# Ship-Auftrag: Lokaler KI-Coach + Plan-Auto-Anpassung → Release 1.1.0

Stand: 2026-10-21 · Geschrieben für eine neue Claude-Session, die die App veröffentlicht (Windows-Installer + Auto-Update).

## Ziel
Branch `lokaler-coach` nach `main` bringen, Version auf **1.1.0** erhöhen, Release-Tag `v1.1.0` → GitHub-Actions baut den
Windows-Installer (`FitCoach-Setup-1.1.0.exe`) + `latest.yml`, die installierte App (1.0.3) aktualisiert sich selbst.

## Git-Lage (geprüft 2026-10-21)
- `lokaler-coach` (HEAD `1d67b21`) enthält **alles**: `main` + `plan-auto-anpassung` + lokaler Coach. 31 Commits vor `main`, `main` hat nichts, was fehlt → **Fast-Forward-Merge** möglich.
- `origin/main` = `52dddce`, lokales `main` = `0f6b74b` (1 Commit nicht gepusht, nur Doku).
- Branches `plan-auto-anpassung` und `lokaler-coach` sind **nicht** auf GitHub.
- Letztes Release: `v1.0.3`. `package.json` steht auf `1.0.3`.
- Ungetrackt, NICHT committen: `Musik.lnk`, `securityprompt.md`.

## Was seit 1.0.3 neu ist
1. **Plan-Auto-Anpassung** (`src/shared/adapt`, `electron/lib/adaptData.ts`, `planProposals.ts`): Dialog „Wie war's?“ nach Läufen, Regel-Vorschläge (R1–R6), Tempo-Einschätzung, „Nicht 100 %“, Leistungszahl. Neue Tabelle `plan_proposals` (Migration + Backup v8).
2. **Lokaler KI-Coach (Ollama)** – Spec `docs/superpowers/specs/2026-10-20-lokaler-coach-design.md`, Plan `docs/superpowers/plans/2026-10-20-lokaler-coach.md`:
   - Einstellungen → „Lokaler Coach (Ollama)“: Ein/Aus, Adresse, „Verbindung testen“, Modell, Speichern.
   - Coach-Seite → Abschnitt „Lokaler Coach“: Zeitraum, Nachricht an den Coach (optional), „Lokalen Coach fragen“, „Nachfrage stellen“, Status mit Zeichenzähler + Abbrechen.
   - Antwort: Erklärung („Du:/Coach:“) + Plan-Änderungen in der bekannten Vorschau `ChangeReview` → „Übernehmen“ (nur Einheiten ab heute, `applyCoachChanges`). Übernommenes Ergebnis wird markiert und nicht erneut angeboten.
   - Verlauf der letzten 10 Fragen/Antworten (nur lesen, löschbar).
   - Technik: `electron/lib/ollama{Client,Prompt,Job,History}.ts`, `electron/ipc/ollama.ts` (Kanäle `OLLAMA_*`), `src/shared/ollamaUrl.ts`, UI `src/components/settings/OllamaSettings.tsx`, `src/components/coach/LocalCoachSection.tsx`, `LocalCoachHistory.tsx`. Einstellungen in `app_settings` (`ollama.enabled|url|model|lastResult|history`), **keine** Migration nötig, nicht im Backup.
   - Kein neues npm-Paket. Renderer-CSP unverändert (nur Main ruft Ollama auf).
3. Kerims Ollama: PC `http://192.168.0.66:11434`, Modell `qwen3:8b` (Laptop-App greift übers Heimnetz zu).

## Prüfstand vor dem Ship (zuletzt 2026-10-21 auf `1d67b21`)
- `npx tsc --noEmit -p tsconfig.json` ✅ · `npx tsc --noEmit -p tsconfig.electron.json` ✅
- `npx vitest run` ✅ 501/501 · `npm run build` ✅ · `npx playwright test` ✅ 9/9 (E2E mit Fake-Ollama `e2e/fakeOllama.ts`)
- **Noch nicht** geprüft: echter Lauf mit Kerims eigenen Daten gegen `qwen3:8b` (Auto-Mode blockiert Probeläufe mit echten Gesundheitsdaten übers Netz → Kerim testet selbst in der App).

## Ship-Schritte (in Git Bash; Kerim bestätigt Merge/Push/Tag)
1. Auf `lokaler-coach`: alles noch einmal grün: beide `tsc`, `npx vitest run`, `npm run build`, `npx playwright test`.
2. Rauchtest des gepackten Builds ohne echte Daten: `npm run dist` (veröffentlicht nie) → `release/win-unpacked/FitCoach.exe` mit `--user-data-dir=<temp>` per Playwright starten, Seiten „Heute“, „Plans“, „Coach“, „Einstellungen“ öffnen, keine Konsolenfehler. Lokaler Coach in der gepackten App: CSP gilt nur im Renderer, Ollama-Aufruf läuft im Main → muss funktionieren.
3. `git switch main && git merge --ff-only lokaler-coach`
4. `package.json` → `"version": "1.1.0"`, committen: `chore: Version 1.1.0`.
5. `git push origin main` → CI (`.github/workflows/ci.yml`, windows-latest) muss grün werden (Typecheck, Unit, Build, E2E, `electron-builder --dir`).
6. `git tag v1.1.0 && git push origin v1.1.0` → `release.yml` baut Installer + Blockmap + `latest.yml` und erstellt das Release per `gh release create`. **Tag-Push kann von der Auto-Mode-Prüfung blockiert werden → dann pusht Kerim selbst.**
7. Prüfen: `gh release view v1.1.0` zeigt `FitCoach-Setup-1.1.0.exe`, `.blockmap`, `latest.yml` – genau **ein** Release.
8. Kerim: installierte App öffnen → Einstellungen → „App & Updates“ → Update auf 1.1.0 laden + neu starten. Alternativ Installer von GitHub laden (SmartScreen-Warnung, da nicht signiert → „Weitere Informationen“ → „Trotzdem ausführen“).
9. Nach dem Update in der installierten App: Einstellungen → Lokaler Coach: Adresse `http://192.168.0.66:11434`, „Verbindung testen“, `qwen3:8b`, Speichern (Einstellungen liegen in der echten DB, müssen dort einmal gesetzt werden).
10. Danach Skill `uebergabe` ausführen; Branches `plan-auto-anpassung`/`lokaler-coach` können lokal gelöscht werden (`git branch -d`).

## Gotchas für den Ship
- Echte DB: `%APPDATA%\FitCoach\fitcoach.db` – nie direkt ändern. Beim ersten Start von 1.1.0 läuft die Migration für `plan_proposals`; vorher wird automatisch `backups/vor-migration-*.db` geschrieben.
- Release-Workflow: nie `--publish always` (doppelte Releases); Installer-Name ohne Leerzeichen (`nsis.artifactName`).
- Port 5173 vor E2E/Rauchtests frei machen; `FITCOACH_LOAD_DIST=1` lädt `dist/` statt Vite.
- Installer ist nicht signiert (Backlog: SignPath Foundation).
- Weitere Projektregeln: `CLAUDE.md` (Abschnitt Gotchas, Punkt „Release“ und „Lokaler Coach (Ollama)“).

## Offene Kleinigkeiten (kein Ship-Blocker, stehen in `docs/BACKLOG.md`)
- `OLLAMA_MARK_APPLIED` ohne `createdAt`-Abgleich; Markier-Fehler wird verschluckt.
- Weiterleitung/Lesefehler werden als „nicht erreichbar“ gemeldet.
- Coach-Seite liest „Lokaler Coach an?“ nur beim Öffnen der Seite.
- Bericht-Länge mit echten Daten messen (`num_ctx` 8192 / automatisch 12288).
- Zuordnung Lauf ↔ Plan-Einheit nur am selben Tag (±1 Tag im Backlog).
