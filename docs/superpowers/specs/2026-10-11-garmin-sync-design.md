# Phase 3 – Garmin: Mehrfach-Import, Duplikate, Lauf-Details, intervals.icu-Sync

Stand 2026-10-11. Branch `phase-3-garmin` (baut auf `phase-2-trainingsplan` auf).

## Ziel
Kein Abtippen mehr: Läufe kommen per intervals.icu-Sync oder per Mehrfach-Datei-Import in die App,
doppelte werden erkannt, jeder Lauf hat Splits pro km, Höhenmeter und Verläufe (Puls, Pace, Höhe).
Recovery-Werte (HRV, Schlaf, Ruhepuls) kommen aus intervals.icu.

## Entscheidungen (Kerim, 11.10.2026)
- Sync **beim App-Start + Knopf** „Jetzt synchronisieren“.
- Recovery-Sync **füllt nur leere Felder**; eigene Eingaben bleiben.
- Lauf-Details: **Splits + Höhe + Verläufe (Diagramme)**.
- Kerim hat noch kein intervals.icu-Konto → Klick-Anleitung am Ende.
- Datei-Import speichert direkt (kein Formular mehr), danach Ergebnisliste.

## Risiko
intervals.icu kündigt an, Garmin-Daten über die API evtl. sperren zu müssen (Garmin-Partnerbedingungen).
Strava-Daten sind schon gesperrt. Folge: Sync muss gesperrte/leere Antworten (403, fehlende Felder)
als „nicht verfügbar“ zählen und nie abstürzen. Datei-Import bleibt vollwertiger Weg.

## Datenmodell (Migration v4)
- `activities` + Spalten: `elevation_gain_m REAL`, `elevation_loss_m REAL`, `moving_time_min REAL`,
  `external_id TEXT` (z. B. `icu:i12345`), Index `UNIQUE(external_id) WHERE external_id IS NOT NULL`.
  `source` darf zusätzlich `intervals_icu` sein.
- Neue Tabelle `activity_splits`: `id`, `activity_id` (FK → activities, ON DELETE CASCADE), `split_index` (1-basiert),
  `distance_km` (letzter Split evtl. < 1), `duration_sec`, `pace_sec_per_km`, `avg_hr`, `elevation_gain_m`, `elevation_loss_m`.
  `UNIQUE(activity_id, split_index)`.
- Neue Tabelle `activity_streams`: `activity_id` PK (FK, CASCADE), `data` TEXT JSON
  `{ t: number[] /*s*/, distKm: (number|null)[], hr: (number|null)[], paceSec: (number|null)[], altM: (number|null)[] }`,
  auf max. **500 Punkte** verkleinert.
- Neue Tabelle `app_settings`: `key TEXT PK`, `value TEXT`. Schlüssel: `intervals.apiKey` (verschlüsselt, Base64),
  `intervals.lastSyncAt` (ms), `intervals.lastResult` (JSON).
- `recovery_logs` + Spalte `sleep_hours REAL`; `source` darf `intervals_icu` sein.
- Backup-Format **v6** = v5 + `activitySplits`, `activityStreams`. `app_settings` wird **nie** exportiert (Geheimnis).
  v1–v5 bleiben importierbar.

## Bausteine (alle in `electron/lib`, ohne `electron`-Import, testbar)
1. **Parser** (`garminParse.ts`): `.fit`/`.tcx` → `ParsedActivity = { activity: Partial<CreateActivityPayload>, samples: Sample[] }`,
   `Sample = { tSec, distKm?, hr?, altM? }`. FIT-Mapping als reine Funktion `fitDataToParsed(data)` (testbar mit Objekt-Fixture).
   Datum weiter lokal (`toLocalDateTime`). `fit-file-parser` bleibt 1.x (keine echte .fit zum Prüfen).
   Wichtig: die Garmin-Datei-Rohdaten (`rawGarminData`) nur noch kompakt (Session-Summen), Samples nicht dort speichern.
2. **Details** (`activityDetails.ts`): `computeSplits(samples)` (pro volle km + Rest-Split ≥ 50 m),
   `elevation(samples)` (Gain/Loss mit 3-m-Hysterese gegen GPS-Rauschen), `downsampleStreams(samples, 500)`
   (Pace aus Distanz/Zeit über gleitendes Fenster, Pace > 20 min/km → null).
3. **Duplikate** (`dedupe.ts`): `findDuplicate(db, cand)` → Treffer, wenn gleicher `external_id`, **oder**
   gleicher Tag + Startzeit ±2 Min + Distanz ±3 % (ohne Distanz: Dauer ±3 %). Ohne Startzeit: gleicher Tag + Typ + Distanz ±3 %.
4. **Speichern** (`importActivity.ts`): `saveImported(db, parsed, { fileName?, externalId?, source })` in **einer Transaktion**:
   Dedupe → insert activity → splits → streams → `matchActivity`. Ergebnis `{ status: 'created' | 'duplicate', activityId }`.
5. **intervals.icu-Client** (`intervalsClient.ts`): Basic-Auth (`API_KEY` : Schlüssel), Athlet `0`, `fetch` injizierbar.
   `getAthlete()`, `listActivities(oldest, newest)`, `downloadOriginal(id)` (gzip erkennen `1f8b` → entpacken),
   `listWellness(oldest, newest)`. Timeout 20 s, User-Agent `FitCoach-Desktop`, 429 → Abbruch mit Meldung.
6. **Sync** (`intervalsSync.ts`): Zeitraum = letzter Sync −2 Tage (Überlappung) bzw. beim ersten Mal heute −30 Tage, bis heute.
   Je Aktivität: bekannt (`external_id`) → überspringen; sonst Original-Datei laden → parsen → `saveImported`;
   klappt die Datei nicht (403/404/leer, z. B. `source=STRAVA`), aus den Summen-Feldern der Liste anlegen (ohne Splits),
   fehlen auch die → Zähler „nicht verfügbar“. Typ-Mapping: Run/TrailRun/VirtualRun → running, *Ride → cycling,
   WeightTraining → strength, sonst custom (+ `typeLabel`).
   Wellness: `hrv`→`hrvRmssd`, `restingHR`→`restingHr`, `sleepScore`→`sleepScore` (gerundet), `sleepSecs`→`sleepHours`;
   **nur leere Felder füllen**, neue Zeile mit `source='intervals_icu'`, Readiness danach mit `calcReadiness` neu berechnen.
   Nur ein Sync gleichzeitig (laufendes Promise wiederverwenden). Ergebnis
   `SyncResult = { created, duplicates, unavailable, recoveryDays, errors: string[], from, to, at }` → in `app_settings`.
7. **Geheimnis** (`electron/ipc/intervals.ts`, nicht lib): Schlüssel mit `safeStorage.encryptString` speichern;
   ist Verschlüsselung nicht verfügbar → Fehlermeldung, **kein** Klartext-Fallback. Schlüssel nie an den Renderer zurückgeben, nie loggen.

## IPC (je Kanal in `IPC`, `ipcInputs`, `IpcResults`)
- `garmin:importFiles` `{ files: { fileName, data: Uint8Array }[] }` (1–50 Dateien, je ≤ 50 MB, .fit/.tcx)
  → `{ fileName, status: 'created'|'duplicate'|'error', activityId?, message? }[]`. Ersetzt `garmin:parse`.
- `activities:details` `id` → `{ splits: ActivitySplit[], streams: ActivityStreams | null }`.
- `intervals:status` → `{ configured, encryptionAvailable, lastSyncAt?, lastResult? }`.
- `intervals:setKey` `{ apiKey: string(10–200) }` → prüft per `getAthlete()`, speichert erst bei Erfolg → `{ athleteName? }`.
- `intervals:clearKey` → void. `intervals:sync` → `SyncResult`.

## Oberfläche (neue Texte auf Deutsch)
- **Aktivitäten**: Drop-Zone nimmt mehrere Dateien (Ziehen + Auswahl), zeigt Ergebnisliste („3 neu · 1 doppelt · 0 Fehler“).
  Sync-Leiste: „intervals.icu: zuletzt vor 5 Min · [Jetzt synchronisieren]“ bzw. „nicht verbunden → Einstellungen“.
- **Auto-Sync** beim Start: `Layout` ruft einmal pro App-Start `intervals:sync`, wenn verbunden; Fehler still in der Sync-Leiste.
  Nach Sync Listen/Dashboard neu laden (einfaches Event `fitcoach:data-changed` im Renderer).
- **Aktivität aufgeklappt**: Höhenmeter (+/−), Splits-Tabelle (km, Zeit, Pace, Puls, Höhe), drei kleine Recharts-Diagramme
  (Puls, Pace, Höhe über Distanz). Details erst beim Aufklappen laden. Alte Läufe ohne Details: Hinweis „Keine Details (alter Import)“.
- **Einstellungen**: Abschnitt „intervals.icu“: Passwortfeld für Schlüssel, „Verbinden“ (prüft), „Trennen“, Status + letzter Sync.
- **Recovery**: Schlafdauer (h) anzeigen, falls vorhanden; Herkunft „intervals.icu“ kennzeichnen.

## Tests
Unit: Splits/Höhe/Downsampling, `fitDataToParsed`, TCX mit Trackpoints, Dedupe-Regeln, `saveImported` (Transaktion, Duplikat,
Auto-Zuordnung), Client mit Fake-`fetch` (Auth-Header, gzip, 403, 429), Sync (Zeitraum, Fallback, Wellness nur leere Felder),
Migration v4 (bestehende Daten bleiben), Backup v6 rund + v5-Import, IPC-Vertrag.
Rauchtest: Playwright mit Temp-Profil + DB-Kopie, beide echten TCX aus `Downloads` importieren (einmal neu, zweites Mal doppelt),
Details aufklappen. Echte TCX/DB werden nie ins Repo kopiert.

## Nicht in Phase 3
Ordner-Überwachung, Nachberechnen alter Läufe, OAuth, Body Battery aus intervals.icu (gibt es dort nicht),
`fit-file-parser`-Update (braucht echte .fit-Datei).

## Umsetzung (Subagents, nacheinander, da gemeinsame Dateien)
- **A Kern**: Migration v4 + Schema, Bausteine 1–4, Backup v6, IPC `garmin:importFiles` + `activities:details`, Tests.
- **B intervals.icu**: Bausteine 5–7, IPC `intervals:*`, Tests.
- **C UI**: Drop-Zone, Sync-Leiste, Auto-Sync, Details-Ansicht, Einstellungen, Recovery.
- Danach: Prüfen (Tests, Typechecks, Build), Rauchtest, Doku (CLAUDE.md, BACKLOG, HANDOFF).
