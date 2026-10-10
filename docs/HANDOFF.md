# Übergabe – FitCoach – 2026-10-10

## Ziel der letzten Session
Komplett-Analyse (→ `docs/AUDIT-2026-10.md`, Note 4,5/10, 7-Phasen-Plan, Entscheidungen in Abschnitt 8) und Phase 0 „Datensicherheit".

## Stand
- Branch `phase-0-datensicherheit`, Commit „Phase 0: Datensicherheit" (noch nicht gemergt/gepusht).
- Erledigt: Single-Instance-Lock, Flush bei Windows-Abmeldung, tägliche Auto-Sicherung (14) in `userData/backups`, Transaktionen (Plan anlegen/anpassen/aktivieren, HR-Zonen, Import), Backup v3 mit allen 15 Tabellen, Garmin-Datum in Ortszeit, `foreign_keys` nach `export()` wieder an.
- Geprüft: beide Typechecks, 26 Tests, `npm run build` grün; App mit DB-Kopie gestartet (eigenes `--user-data-dir`), Sicherung angelegt, 2. Instanz beendet sich sofort. Echte DB unberührt.
- Sicherung der echten DB: `%APPDATA%\FitCoach\backups-manual\fitcoach-2026-10-10-vor-umbau.db`.

## Offen / angefangen
- Branch mergen + pushen (nach kurzem Check durch Adel).
- Echte DB enthält Datenmüll: 11 verwaiste Phasen, 47 verwaiste Wochen (+ deren Sessions) von gelöschten Plänen, alte Tabellen `coach_conversations/messages`.
- FIT-Datei-Datum nur über TCX-Test + gemeinsame Hilfsfunktion abgedeckt, nicht mit echter .fit getestet.

## Nächste sinnvolle Schritte
1. **Phase 1 Fundament (empfohlen):** Electron 31→44 + Pakete; DB-Schicht neu (echte Datei-DB mit WAL statt sql.js – erst Mini-Spike), saubere Baseline-Migration statt `applySchemaPatches`, Müll aufräumen (mit Sicherung), Zod-Prüfung aller IPC-Eingaben im Hauptprozess, Module Habits/Ernährung/Körper/Challenges entfernen (Daten bleiben im v3-Backup).
2. Phase 2 Trainingsplan neu (Startdatum, Kalender, Woche-für-Woche, Auto-Zuordnung Lauf↔Einheit).
3. Phase 3 intervals.icu-Sync (Adel braucht Gratis-Konto + API-Schlüssel → Anleitung geben).

## Gotchas, die neu gelernt wurden
- sql.js `export()` setzt PRAGMAs zurück → `foreign_keys` danach neu setzen (ist in `flushDb`).
- drizzle 0.30 `db.transaction()` läuft mit sql-js synchron und rollt korrekt zurück (`electron/lib/transaction.ts`).
- Testen ohne echte Daten: `npx electron . --user-data-dir=<tempordner>` (Vite muss laufen).
- v3-Backups müssen alle Tabellen enthalten, sonst Abbruch vor dem Löschen.

## Wichtige Dateien
`docs/AUDIT-2026-10.md`, `CLAUDE.md`, `db/index.ts`, `electron/main.ts`, `electron/lib/{importBackup,backupFormat,backupRotation,adaptPlan,transaction,garminParse,testDb}.ts`
