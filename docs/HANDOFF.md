# Übergabe – FitCoach – 2026-10-11

## Ziel der letzten Session
Phase 3 „Garmin“ aus `docs/AUDIT-2026-10.md` (Spec `docs/superpowers/specs/2026-10-11-garmin-sync-design.md`).

## Stand
- Branch `phase-3-garmin` (auf `phase-2-trainingsplan` → `phase-1-fundament` → `phase-0-datensicherheit`). **Nichts gemergt/gepusht.**
- Migration v4: Höhe/Bewegungszeit/`external_id` an Aktivitäten, Tabellen `activity_splits`, `activity_streams`, `app_settings`, `recovery_logs.sleep_hours`. Backup v6 (Settings nie im Backup).
- Mehrfach-Import .fit/.tcx direkt speichern + Ergebnisliste; Duplikat-Erkennung (ID oder Tag+Zeit±2 Min+Distanz±3 %).
- Lauf-Details: Splits pro km, Höhenmeter, Diagramme Puls/Pace/Höhe (beim Aufklappen der Aktivität).
- intervals.icu-Sync: Läufe (Original-Datei → gleiche Pipeline, sonst Summen) + Recovery (füllt nur leere Felder). Beim App-Start + Knopf. Schlüssel verschlüsselt via `safeStorage`.
- UI: Sync-Leiste auf „Aktivitäten“, Abschnitt in Einstellungen, Schlafdauer im Recovery.
- Geprüft: 240 Tests, beide Typechecks, Build grün. Rauchtest (Playwright, **Kopie** der echten DB v0→v4): beide echten TCX importiert (2 neu), zweiter Import „2 doppelt“, Splits + 3 Diagramme sichtbar, keine Konsolenfehler. Echte DB unberührt (Stand 04.10.).

## Offen / angefangen
- Sync **nicht** mit echtem intervals.icu-Konto getestet (Adel hat noch keins) – nur mit Fake-Antworten.
- Risiko: intervals.icu kündigt an, Garmin-Daten über die API evtl. zu sperren → dann zählt der Sync „nicht verfügbar“, Datei-Import bleibt.
- FIT-Höhe: fit-file-parser liefert bei `lengthUnit:'km'` Höhe in km (laut Quellcode) → ×1000. Ohne echte .fit ungeprüft.
- Lauf-Kadenz aus TCX ist halbe Schrittfrequenz (Backlog).
- Adel: App starten (echte DB migriert v0→v4, Sicherung automatisch), intervals.icu verbinden, dann Branches mergen + pushen.

## Nächste sinnvolle Schritte
1. **Phase 4 Coach-Export (empfohlen)**: jetzt mit Splits/Recovery/Schlaf als Datenbasis (CTL/ATL/TSB, Steigerungswarnung).
2. intervals.icu mit echtem Konto prüfen (erster Sync, Recovery-Werte).
3. Phase 5 UX/Deutsch (Rest der App noch englisch).

## Gotchas, die neu gelernt wurden
- `start_date_local` von intervals.icu ist Ortszeit ohne Zone → String schneiden, nie `new Date()`.
- intervals.icu: Basic-Auth `API_KEY:<schlüssel>`, Athlet `0`, eigener User-Agent (Cloudflare), Original-Datei evtl. gzip.
- Playwright: Chevron-Buttons gibt es auch in Filter-Selects → Karten-Knopf gezielt über die Karte ansprechen; Inhalt scrollt in innerer ScrollArea.

## Wichtige Dateien
`electron/lib/{garminParse,activityDetails,dedupe,importActivity,activityInsert,intervalsClient,intervalsSync,appSettings}.ts`, `electron/ipc/{garmin,intervals}.ts`, `db/migrations.ts` (v4), `src/hooks/useIntervalsSync.ts`, `src/lib/dataEvents.ts`, `src/components/activities/{GarminDropZone,IntervalsSyncBar,ActivityDetails}.tsx`, `src/components/settings/IntervalsSettings.tsx`
