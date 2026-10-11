# Übergabe – FitCoach – 2026-10-11

## Ziel der letzten Session
Phase 1 „Fundament“ aus `docs/AUDIT-2026-10.md`.

## Stand
- Branch `phase-1-fundament` (baut auf `phase-0-datensicherheit` auf), 3 Commits 1a/1b/1c. **Nicht gemergt/gepusht** – wartet auf Adels Check.
- 1a: Electron 31 → 44.7. DB jetzt `node:sqlite` (eingebaut, nichts kompilieren) mit WAL, eigener Drizzle-Adapter, eigenes Migrationssystem (`user_version`): v1 Baseline/Übernahme, v2 Aufräumen. Habits/Ernährung/Körper/Challenges aus UI+IPC+DB entfernt.
- 1b: IPC-Vertrag `src/types/ipcContract.ts` (Zod 4), jede Eingabe im Hauptprozess geprüft (`electron/ipc/handle.ts`).
- 1c: React 19, Vite 8, vitest 5, Tailwind 4, recharts 3, date-fns 4, react-router 7. ARCHITECTURE.md/README neu.
- Geprüft: beide Typechecks, 59 Tests, Build, `dist:dir` grün. Dev-App + gepackte App mit **Kopie** der echten DB: keine Konsolenfehler, Vorher/Nachher-Screenshots aller Seiten gleich, alle 43 Recovery-Tage + Profil laufen durch die neue Prüfung.
- Migration auf DB-Kopie: 28 Aktivitäten, 43 Recovery, 34 Check-ins, 1 Plan bleiben; gelöscht 11 Phasen / 61 Wochen / 357 Sessions (Waisen gelöschter Pläne). Echte DB unberührt.

## Offen / angefangen
- Adel: App einmal starten (dann migriert die echte DB automatisch, mit Sicherung in `%APPDATA%\FitCoach\backups\`), Plan prüfen, dann mergen + pushen (beide Branches).
- Untracked im Hauptordner: `Musik.lnk`, `securityprompt.md` – gehören Adel, nicht angefasst.

## Nächste sinnvolle Schritte
1. **Phase 2 Trainingsplan neu (empfohlen):** Startdatum, Kalender, Woche-für-Woche, Distanz/Pace/Intervalle, Auto-Zuordnung Lauf↔Einheit. Schema-Änderung = neue Migration v3 in `db/migrations.ts`.
2. Phase 3 intervals.icu-Sync (Adel braucht Gratis-Konto + API-Schlüssel → Anleitung geben).
3. Phase 4 Coach-Export (Recovery/Check-ins fehlen darin).

## Gotchas, die neu gelernt wurden
- `drizzle-orm/better-sqlite3` nicht importieren (lädt nicht installiertes Paket) → Adapter `db/nodeSqliteAdapter.ts`.
- vitest < 3 kann `node:sqlite` nicht laden.
- `npx @tailwindcss/upgrade` hat `package.json` geleert → nur mit sauberem Git-Stand.
- Port 5173 kann von alter Vite-Instanz belegt sein → `--strictPort`, sonst testet man alten Code.
- Rauchtest-Muster: Playwright `_electron.launch({ args: ['.', '--user-data-dir=<temp>'] })` bzw. `executablePath: release/win-unpacked/FitCoach.exe`.

## Wichtige Dateien
`db/{index,migrations,nodeSqliteAdapter,schema}.ts`, `src/types/ipcContract.ts`, `electron/ipc/{handle,runHandler}.ts`, `electron/lib/{backupFormat,backupRotation,importBackup}.ts`, `src/index.css`, `ARCHITECTURE.md`
