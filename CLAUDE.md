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
- Neuer IPC-Kanal: in `IPC` eintragen, in `ipcInputs` + `IpcResults` (ipcContract.ts) ergänzen, Handler mit `handle(IPC.X, fn)` aus `electron/ipc/handle.ts` (validiert + verpackt Fehler; Kern in `runHandler.ts`)
- `electron/lib/*` – reine Logik ohne `electron`-Import → hier testen
- `db/schema.ts` (Drizzle), `db/index.ts` (node:sqlite, WAL, Migrationen)
- `src/` – React-Renderer; IPC nur über `invoke()` aus `src/lib/ipc.ts`, Kanäle in `src/types/ipc.ts`, **IPC-Vertrag** (Zod-Eingabeschema + Ergebnistyp je Kanal) in `src/types/ipcContract.ts`

## Gotchas
- **Echte Daten:** `%APPDATA%\FitCoach\fitcoach.db`. Nie direkt ändern. Sicherung vor dem Umbau: `%APPDATA%\FitCoach\backups-manual\`.
- DB schreibt direkt per WAL (kein markDirty/Flush mehr).
- Datum immer **lokal** (`date-fns format(..., 'yyyy-MM-dd')`), nie `toISOString()` (UTC → falscher Tag in Österreich).
- `YYYY-MM-DD`-Strings beim Parsen mit `T12:00:00` ergänzen, damit sich der Tag nicht verschiebt.
- Wochentage in Plänen: 1=Mo … 7=So.
- **Migrationen** von Hand in `db/migrations.ts` (Version in `PRAGMA user_version`, kein drizzle-kit). Schema-Änderung = neue Migration anhängen + `db/schema.ts` anpassen + Test in `db/migrations.test.ts`. Vor Migrationen auf bestehender DB wird automatisch `backups/vor-migration-*.db` geschrieben.
- DB-Treiber: `node:sqlite` (in Electron 44 eingebaut, nichts kompilieren) mit eigenem Drizzle-Adapter `db/nodeSqliteAdapter.ts` (bildet better-sqlite3-API nach; `drizzle-orm/better-sqlite3` NICHT direkt importieren – lädt das nicht installierte Paket).
- vitest braucht ≥ 3 (aktuell 5), sonst kann es `node:sqlite` nicht laden. Vite-Config heißt `vite.config.mts`.
- Tailwind 4 (CSS-first in `src/index.css`, keine tailwind.config). `vspace-N` = eigene Utility mit altem v3-`space-y`-Verhalten. `npx @tailwindcss/upgrade` hat einmal `package.json` geleert → nur mit Git-Sicherung laufen lassen. Tests nutzen In-Memory-DB mit echten Migrationen (`electron/lib/testDb.ts`).
- `main.js` liegt unter `dist-electron/electron/main.js`.
- Mehrschrittige Schreibvorgänge immer in einer Transaktion: `runInTransaction` aus `electron/lib/transaction.ts` (synchron, `BEGIN IMMEDIATE`).
- App ohne echte Daten testen: Vite starten, dann `npx electron . --user-data-dir=<tempordner>` (Kopie von `fitcoach.db` hineinlegen). Port 5173 muss frei sein (`--strictPort`).
- Backup-Format v5 = alle Tabellen (`electron/lib/backupFormat.ts`); neue Tabellen dort eintragen. v1–v4 bleiben importierbar (alte Plan-Phasen → `electron/lib/legacyPlan.ts`).
- **Plan-Datum wird berechnet** (`startDate` Montag + weekIndex + Wochentag) in `src/shared/planCalendar.ts` – gemeinsam für Main und Renderer (`src/shared` ist in `tsconfig.electron.json` eingebunden; dort kein `@/`-Alias benutzen). Nie ein Datum in `plan_sessions` speichern.
- Neue Aktivität → `matchActivity` (Auto-Zuordnung), Löschen → vorher `releaseActivity` (`electron/lib/matchSessions.ts`).
- Entfernt (Phase 1): Habits, Ernährung, Körper, Challenges. Alte Daten liegen in `backups/vor-v2-alle-tabellen-*.json`.
- Rauchtest ohne echte Daten: Playwright `_electron.launch({ args: ['.', '--user-data-dir=<temp>'] })` (gepackt: `executablePath: release/win-unpacked/FitCoach.exe`). Port 5173 vorher frei machen, sonst läuft alter Code.
- Zod 4: `.extend()`/`.partial()` nicht auf Objekten mit `.refine()` – Refine zuletzt anhängen.
- Unverpackte App lädt immer `http://localhost:5173` → für Rauchtests Vite starten; Testdaten per `window.fitcoach.invoke(...)` aus Playwright anlegen.
- **Garmin-Import** (Phase 3): Datei → `parseGarminFile` → `saveImported` (`electron/lib/importActivity.ts`: Dedupe + Splits + Streams + `matchActivity` in einer Transaktion). Duplikat-Regeln in `dedupe.ts`; Treffer mit `externalId` trägt die ID nach.
- **intervals.icu**: Client/Sync in `electron/lib/intervals{Client,Sync}.ts` (fetch injizierbar, Tests ohne Netz). Schlüssel nur per `safeStorage` verschlüsselt in `app_settings` (nie Klartext, nie im Backup, nie an Renderer). `start_date_local` ist Ortszeit ohne Zone → String schneiden, nicht `new Date()`.
- Renderer-Neuladen nach Import/Sync: `emitDataChanged()` / `onDataChanged()` aus `src/lib/dataEvents.ts`.
- **Coach** (Phase 4): reine Logik in `src/shared/coach` (Zonen Karvonen, TRIMP, CTL/ATL/TSB, Steigerung, Riegel-Prognose); DB-Anbindung `electron/lib/coachData.ts`, Bericht `coachExport.ts`, Übernehmen `coachChanges.ts`. Gespeicherte `hr_zones` haben Vorrang, sonst automatisch berechnet.
- **Phase 5:** „Heute“ = Tageswechsel (`user_profile.day_start_hour`, Standard 4 Uhr). Main: `appToday(db)` (`electron/lib/today.ts`), Renderer: `today()` (`src/lib/today.ts`) – nie `format(new Date(), …)`/`todayLocal()` direkt.
- Schuhe: Tabelle `shoes`, `activities.shoe_id`; neue Läufe ohne `shoeId` bekommen den Standard-Schuh in `insertActivity` (`null` = bewusst keiner). Backup v7.
- Check-in-Seite entfernt → Befinden `recovery_logs.feeling` (1–5) über `RECOVERY_SET_FEELING`; `daily_checkins` bleibt nur als Altdaten.
- Rückgängig nach Löschen: Main hält die letzten 10 Snapshots im Speicher (`electron/lib/activityTrash.ts`), weg nach Neustart.
- IPC-Antworten kommen in Playwright als `{success, data}` – in Testskripten auspacken. Zahl-Inputs mit Punkt füllen.
- Suspense für lazy Seiten nur um `<Outlet />` in `Layout.tsx` (sonst flackert die Sidebar).
- Claude-Änderungen (`fitcoachChanges`-JSON) verweisen per `sessionId` (`#123` im Bericht); nur geplante Einheiten ab heute, alles in einer Transaktion.
- **Phase 6 Release:** E2E in `e2e/` (`npm run build && npx playwright test`); `FITCOACH_LOAD_DIST=1` lässt die unverpackte App `dist/` statt Vite laden (kein Vite nötig). E2E-Selektoren hängen an deutschen UI-Texten.
- CI (`.github/workflows/ci.yml`) läuft auf `windows-latest` bei jedem Push: Typecheck, Unit, Build, E2E, `electron-builder --dir`.
- **Release:** Version in `package.json` erhöhen, committen, `git tag vX.Y.Z && git push origin vX.Y.Z` → `release.yml` baut Installer + `latest.yml` und veröffentlicht das GitHub-Release. Lokal `npm run dist` veröffentlicht nie (`--publish never`).
- Auto-Update: `electron-updater` (`electron/updater.ts`, Status-Logik `electron/lib/updateStatus.ts`), nur in installierter App; Einstellungen → „App & Updates“. Installer ist **nicht signiert** (SmartScreen-Warnung beim ersten Installieren).
