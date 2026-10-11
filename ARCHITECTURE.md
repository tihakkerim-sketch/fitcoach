# FitCoach – Architektur

Kurzüberblick über den echten Stand (nach Phase 1). Befehle, Gotchas und Konventionen
stehen in [`CLAUDE.md`](CLAUDE.md) und werden hier nicht wiederholt. Hintergrund und
Phasenplan: [`docs/AUDIT-2026-10.md`](docs/AUDIT-2026-10.md).

Die Module Habits, Ernährung, Körper und Challenges wurden in Phase 1 entfernt.

## 1. Prozesse

Electron-App mit drei Teilen:

| Teil | Ort | Aufgabe |
|---|---|---|
| Hauptprozess | `electron/main.ts`, `electron/ipc/*` | Fenster, Datenbank, Dateien, alle Logik mit Datenzugriff |
| Preload | `electron/preload.ts` | Schmale Brücke (`window.fitcoach.invoke/on/off`) |
| Renderer | `src/` | React-Oberfläche, kein direkter Zugriff auf DB oder Dateisystem |

Sicherheit: `contextIsolation: true`, `sandbox: true`, Content-Security-Policy nur in
der Produktion, nur eine App-Instanz gleichzeitig (`requestSingleInstanceLock`).

## 2. Datenbank

- **Treiber:** `node:sqlite` (in Electron 44 eingebaut, nichts zu kompilieren).
  Datei: `%APPDATA%\FitCoach\fitcoach.db`.
- **WAL-Modus** (`journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`).
  Jeder Schreibvorgang landet sofort auf der Platte – es gibt kein „Speichern später".
- **Drizzle** über einen eigenen Adapter (`db/nodeSqliteAdapter.ts`), der die
  better-sqlite3-Schnittstelle nachbildet. Schema in `db/schema.ts`.
- **Start-Ablauf** (`db/index.ts`, `initDb()`): DB öffnen → tägliche Sicherung →
  Migrationen. Schlägt eine Migration fehl, zeigt die App einen Fehler und beendet sich.
- **Beenden:** `closeDb()` macht einen WAL-Checkpoint und schließt die Datei
  (idempotent, wird bei `session-end` und `before-quit` aufgerufen).
- **Transaktionen:** mehrschrittige Schreibvorgänge über `runInTransaction`
  (`electron/lib/transaction.ts`, synchron, `BEGIN IMMEDIATE`).

### Migrationssystem (`db/migrations.ts`)

- Schema-Version in `PRAGMA user_version`. Kein drizzle-kit.
- Liste von Migrationen mit Nummer, Name und `up()`-Funktion:
  - **v1 Baseline:** bringt jede ältere DB auf den Grundstand (repariert Fehlendes, ändert keine Daten).
  - **v2 Aufräumen:** entfernt Waisen, tote Verknüpfungen und Tabellen der entfernten Module.
- **Ablauf:** offene Migrationen suchen → Sicherung `backups/vor-migration-v{von}-v{bis}-*.db`
  (per `VACUUM INTO`) → jede Migration in einer Transaktion → Fremdschlüssel-Prüfung →
  `user_version` setzen. Jeder Fehler bricht ab und rollt zurück.
- v2 schreibt zusätzlich eine JSON-Sicherung aller Tabellen
  (`backups/vor-v2-alle-tabellen-*.json`), bevor Daten entfernt werden.
- Neue Migration = Eintrag anhängen + `schema.ts` anpassen + Test in `db/migrations.test.ts`.

### Tägliche Sicherung (`electron/lib/backupRotation.ts`)

- Beim Start, **vor** den Migrationen: `backups/fitcoach-JJJJ-MM-TT.db` (lokales Datum).
- Per `VACUUM INTO` – eine einfache Dateikopie wäre im WAL-Modus unvollständig.
- Eine Datei pro Tag, die letzten 14 bleiben. Neue/leere DB: keine Sicherung.
- Ein Fehler hier verhindert den App-Start nicht.

## 3. IPC-Vertrag

Ein Kanal = ein Eintrag in drei Dateien:

1. `src/types/ipc.ts` – Kanalname in `IPC`, gemeinsame Typen, `IpcResponse<T>`
2. `src/types/ipcContract.ts` – pro Kanal ein **Zod-Eingabeschema** (`ipcInputs`) und der Ergebnistyp (`IpcResults`)
3. `electron/ipc/<bereich>.ts` – Handler, registriert mit `handle(IPC.X, fn)`

Ablauf eines Aufrufs:

```
Renderer: invoke(IPC.X, payload)        (src/lib/ipc.ts, Typen aus dem Vertrag)
   → Preload → ipcMain
   → handle() / runHandler()            (electron/ipc/handle.ts, runHandler.ts)
        Zod prüft die Eingabe → Handler läuft → Antwort
   ← { success: true, data } | { success: false, error }
Renderer: invoke() wirft bei success:false einen Error mit der Meldung
```

- Die Prüfung läuft im **Hauptprozess** – die Formulare im Renderer sind nur Komfort.
- Validierungsfehler sind kurz und lesbar („Ungültige Eingabe: …"), ohne Stacktrace.
- Garmin-Dateien kommen als `Uint8Array` mit Größenlimit.
- Handler-Dateien in `electron/ipc/`: `activities`, `plans`, `profile`, `recovery`,
  `checkin`, `stats`, `garmin`, `summary` (Coach-Export), `data` (Backup/Import), `settings`.
- `runHandler.ts` und `electron/lib/*` importieren nichts aus `electron` und sind testbar.

## 4. Backup-Format (JSON, v4)

`electron/lib/backupFormat.ts`, `BACKUP_VERSION = 4`.

- Enthält **alle** Tabellen: `userProfile`, `hrZones`, `activities`, `trainingPlans`,
  `planPhases`, `planWeeks`, `planSessions`, `dailyCheckins`, `recoveryLogs`.
- Die Reihenfolge in `BACKUP_TABLES` ist die Einfüge-Reihenfolge (Eltern vor Kindern);
  Löschen läuft umgekehrt. **Neue Tabelle → dort eintragen**, sonst fehlt sie im Backup.
- Import (`electron/lib/importBackup.ts`) liest v1–v4. Schlüssel der entfernten Module in
  v3-Dateien werden ignoriert.
- Das JSON-Backup (Export/Import in den Einstellungen) ist getrennt von den
  `.db`-Sicherungen im Ordner `backups/`.

## 5. Coach-Export (`electron/ipc/summary.ts`)

Reines Copy-Paste: Die App erzeugt einen Markdown-Text für einen Zeitraum, du fügst ihn
in einen KI-Chat ein. Es gibt keine KI-Anbindung in der App. Der Text ist aktuell
**englisch** und enthält:

1. Kopf: Zeitraum, Erstellungsdatum
2. **Athletenprofil:** Name, Alter, Max-HF, Ruhe-HF, Zielwettkampf, Zielzeit, Trainingstage/Woche, Verletzungs-/Gesundheitsnotizen
3. **HF-Zonen** (Zone, Bezeichnung, Bereich)
4. **Aktiver Trainingsplan:** Name, Ziel, Zieldatum und **alle** geplanten Einheiten des Plans
   (Wochentag, Typ, Dauer, Zone, Intensität, Status) – nicht nur die im Zeitraum
5. **Aktivitäten im Zeitraum:** Dauer, Startzeit, Distanz, Ø-/Max-HF (mit Zone), Kadenz,
   gefühlte Anstrengung, Untergrund, Schlaf (Zeiten, Qualität), Kraftübungen, Notizen
6. **Wochenstatistik:** Anzahl je Typ, Laufzeit/-distanz, Ø-Lauf-HF, Radzeit/-distanz, Schlafqualität
7. Fertige Beispiel-Prompts (Woche bewerten, nächste Woche planen, neue Phase entwerfen)

**Nicht enthalten:** Recovery-Werte (HRV, Body Battery, Schlaf-Score, Ruhepuls-Verlauf),
tägliche Check-ins, Readiness, Trainingsbelastung und Trends. Ein besserer Export mit
Änderungs-Vorschau ist geplant (Audit Abschnitt 3.3 und 8).

Der Rückweg (Plan als JSON zurück in die App) läuft über `src/lib/planImport.ts` und
`electron/lib/adaptPlan.ts`; abgeschlossene Einheiten bleiben dabei erhalten.

## 6. Datums-Regeln

(Begründung in `CLAUDE.md`, „Gotchas".)

- Datum = lokaler Kalendertag als `JJJJ-MM-TT`, erzeugt mit `date-fns` `format()`,
  **nie** `toISOString()` (UTC → falscher Tag in Österreich).
- Beim Parsen `T12:00:00` anhängen, damit sich der Tag nicht verschiebt.
- Wochentage in Plänen (`dayOfWeek`): **1 = Montag … 7 = Sonntag**.
- Die tägliche Sicherung nutzt ebenfalls das lokale Datum.

## 7. Ordnerstruktur

```
electron/
  main.ts          Fenster, CSP, Single-Instance, DB-Start/-Ende
  preload.ts       Brücke zum Renderer
  ipc/             ein Handler-Modul pro Bereich + handle.ts / runHandler.ts
  lib/             reine Logik (testbar): Backup, Import, Garmin-Parser, Plan-Anpassung, Transaktionen, testDb
db/
  index.ts         initDb / closeDb / getDb
  migrations.ts    Migrationssystem (+ migrations.test.ts)
  nodeSqliteAdapter.ts   Drizzle-Adapter für node:sqlite
  schema.ts        Drizzle-Schema
src/
  pages/           Dashboard, ActivityLog, DailyCheckin, Recovery, PlanView, PlanDetail, Progress, Export, Settings
  components/      UI-Bausteine
  lib/             invoke(), Zonen, Readiness, Plan-Import, Utils
  schemas/         Zod-Formularschemas
  types/           ipc.ts (Kanäle, Typen), ipcContract.ts (Vertrag)
scripts/           make-icon.js (erzeugt build/icon.ico aus build/icon-source.jpg)
docs/              AUDIT-2026-10.md, BACKLOG.md, HANDOFF.md
```

Build-Ausgabe: Renderer `dist/`, Hauptprozess `dist-electron/` (Einstieg
`dist-electron/electron/main.js`), Installer `release/`.

## 8. Tests

Vitest (≥ 3). Tests laufen gegen eine In-Memory-DB mit den echten Migrationen
(`electron/lib/testDb.ts`). Abgedeckt u. a.: Migrationen, Backup-Rotation, Import,
Transaktionen, Garmin-Parser, Plan-Anpassung, IPC-Vertrag und `runHandler`.
CI: `.github/workflows/ci.yml` (Node 24).
