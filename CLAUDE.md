# FitCoach – Projektnotizen für Claude

Lokale Windows-Desktop-App (Electron) für Lauftraining: Aktivitäten, Trainingspläne, Garmin-Import, Recovery, Coach-Export.
Aktueller Umbau: siehe `docs/AUDIT-2026-10.md` (Phasenplan + Entscheidungen in Abschnitt 8).

## Befehle (in Git Bash oder cmd – PowerShell blockiert evtl. npm)
- `npm run dev` – Vite (5173) + Electron
- `npx tsc --noEmit -p tsconfig.json` – Typecheck Renderer
- `npx tsc --noEmit -p tsconfig.electron.json` – Typecheck Main/DB
- `npx vitest run` – Unit-Tests
- `npm run build` / `npm run dist` – Build / Windows-Installer nach `release/`

## Architektur in Kürze
- `electron/main.ts` – Fenster, CSP (nur prod), registriert IPC-Handler aus `electron/ipc/*` (eine Datei pro Bereich)
- `electron/lib/*` – reine Logik ohne `electron`-Import → hier testen
- `db/schema.ts` (Drizzle), `db/index.ts` (sql.js laden/speichern, Migrationen, `markDirty()`)
- `src/` – React-Renderer; IPC nur über `invoke()` aus `src/lib/ipc.ts`, Kanäle/Typen in `src/types/ipc.ts`

## Gotchas
- **Echte Daten:** `%APPDATA%\FitCoach\fitcoach.db`. Nie direkt ändern. Sicherung vor dem Umbau: `%APPDATA%\FitCoach\backups-manual\`.
- sql.js hält die DB im RAM; nach jedem Schreib-Handler `markDirty()` aufrufen, sonst wird nichts gespeichert.
- Datum immer **lokal** (`date-fns format(..., 'yyyy-MM-dd')`), nie `toISOString()` (UTC → falscher Tag in Österreich).
- `YYYY-MM-DD`-Strings beim Parsen mit `T12:00:00` ergänzen, damit sich der Tag nicht verschiebt.
- Wochentage in Plänen: 1=Mo … 7=So.
- Migrationen: `db/migrations/meta/_journal.json` hat kaputte Zeitstempel; Schema-Reparatur läuft über `applySchemaPatches()` in `db/index.ts`. Wird in Phase 1 durch eine saubere Baseline ersetzt – bis dahin keine neuen Drizzle-Migrationen generieren.
- `main.js` liegt unter `dist-electron/electron/main.js`; WASM-Pfad über `require.resolve('sql.js')`.
- Mehrschrittige Schreibvorgänge immer in einer Transaktion.
- sql.js `export()` setzt PRAGMAs zurück → `foreign_keys = ON` danach neu setzen (passiert in `flushDb`).
- Transaktionen: `runInTransaction` aus `electron/lib/transaction.ts` (drizzle `db.transaction`, synchron mit sql-js).
- App ohne echte Daten testen: Vite starten, dann `npx electron . --user-data-dir=<tempordner>`.
- Backup-Format v3 = alle Tabellen (`electron/lib/backupFormat.ts`); neue Tabellen dort eintragen.
