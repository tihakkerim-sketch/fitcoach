# Übergabe – FitCoach – 2026-10-21

## Ziel der letzten Session
Ship-Auftrag `docs/SHIP-LOKALER-COACH.md`: Plan-Auto-Anpassung + lokaler KI-Coach (Ollama) als Release 1.1.0 veröffentlichen.

## Stand
- **Release v1.1.0 live** auf GitHub (genau ein Release: `FitCoach-Setup-1.1.0.exe`, `.blockmap`, `latest.yml`; als „latest“ markiert). Release-Workflow + CI auf `main` grün.
- `main` = `4deeb91` (Fast-Forward von `lokaler-coach` + `chore: Version 1.1.0`), gepusht. Branches `plan-auto-anpassung` und `lokaler-coach` lokal gelöscht.
- Vor dem Ship geprüft: beide Typechecks, vitest 501/501, Build, Playwright 9/9.
- Rauchtest der **gepackten** App (`release/win-unpacked`, leeres Temp-Profil): Heute/Plan/Coach/Einstellungen laden, beide Coach-Abschnitte da, keine Konsolenfehler, Version 1.0.3 (vor dem Hochzählen gebaut). Ollama-Aufruf aus dem Main gegen Fake-Server auf 127.0.0.1: Verbindungstest, Anfrage, Antwort ok.

## Offen / angefangen
- **Kerim:** installierte App auf 1.1.0 aktualisieren (Einstellungen → „App & Updates“ oder Installer). Beim ersten Start läuft Migration v6 (`plan_proposals`), vorher automatische Sicherung `backups/vor-migration-*.db`.
- **Kerim:** danach Einstellungen → Lokaler Coach: `http://192.168.0.66:11434`, „Verbindung testen“, `qwen3:8b`, Speichern; einmal „Lokalen Coach fragen“ mit echten Daten (Dauer + Qualität ansehen).
- Echter Durchlauf Plan-Anpassung (Feedback nach Lauf → Vorschlag) mit eigenen Daten steht noch aus.

## Nächste sinnvolle Schritte
1. **Empfohlen:** Rückmeldung aus dem echten Test (Coach-Antwortqualität, Vorschläge nach Läufen) → Fehler mit `/bug` melden.
2. Bericht-Länge mit echten Daten messen (`num_ctx` 8192 / 12288).
3. Kleinere Backlog-Punkte, z. B. Lauf-Kadenz verdoppeln, Zuordnung ±1 Tag.

## Gotchas, die neu gelernt wurden
- Gepackte App per Playwright: `_electron.launch({ executablePath: 'release/win-unpacked/FitCoach.exe', args: ['--user-data-dir=<temp>'] })`; Skripte im Scratchpad brauchen `NODE_PATH=<repo>/node_modules`. Lazy Seiten → vor `count()` auf Text warten.
- Ollama-Pfad der gepackten App lässt sich ohne Netz gegen einen Mini-Fake-Server (`/api/tags`, `/api/chat` NDJSON) auf 127.0.0.1 prüfen.
- Alte Phasen-Branches (`phase-*`) liegen noch lokal – alle in `main` enthalten.

## Wichtige Dateien
`docs/SHIP-LOKALER-COACH.md`, `.github/workflows/{ci,release}.yml`, `package.json` (Version 1.1.0), `electron/lib/ollama*.ts`, `electron/lib/planProposals.ts`, `src/shared/adapt/`
