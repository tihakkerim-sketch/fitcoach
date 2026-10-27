# Backlog – FitCoach

Reihenfolge laut `docs/AUDIT-2026-10.md` Abschnitt 7.

- [x] Phase 0 – Datensicherheit (2026-10-10)
- [x] Phase 1 – Fundament (2026-10-11): Electron 44, node:sqlite + WAL, Migrationen, Zod-IPC-Vertrag, Module entfernt, Pakete aktuell
- [x] Phase 2 – Trainingsplan neu (Startdatum, Kalender, Woche-für-Woche, Auto-Zuordnung) – 11.10.2026
- [ ] Plan: Vorlagen / Woche kopieren / automatische Progression im Editor (bewusst nicht in Phase 2)
- [x] Plan: Zuordnung ±1 Tag (Einheit am Folgetag gelaufen) – derzeit nur gleicher Tag
- [x] Phase 3 – Garmin (intervals.icu-Sync, Mehrfach-Import, Duplikate, Splits/Höhe/Verläufe) – 11.10.2026
- [x] intervals.icu-Sync mit echtem Konto: Original-Dateien mit Splits kommen an (Probelauf 14.10.)
- [x] Lauf-Kadenz aus TCX/FIT ist halbe Schrittfrequenz (z. B. 67 statt 134 spm) – verdoppeln für Läufe
- [ ] Alte Läufe ohne Splits: Details nachberechnen durch erneuten Datei-Import (Duplikat ergänzt dann Details)
- [ ] Ordner-Überwachung für Garmin-Dateien
- [x] Phase 4 – Coach (Zonen auto, CTL/ATL/TSB, Steigerungswarnung, Prognose, Coach-Bericht + Änderungs-Vorschau) – 11.10.2026
- [ ] Coach mit echten Daten durchspielen (aktiven Plan, Bericht → Claude → Antwort einfügen)
- [ ] Readiness-Score (Recovery-Seite) relativ zum eigenen HRV-Schnitt statt fester 20–80 ms
- [x] JS-Bündel > 500 kB: Seiten per lazy() laden (12.10.2026)
- [x] Phase 5 – UX & Deutsch (Onboarding, Bearbeiten/Undo, Tageswechsel 04:00, Schuh-km, Befinden statt Check-in, Navigation) – 12.10.2026
- [x] Phase 6 – Release (E2E, Windows-CI, Auto-Update) – Signatur offen, siehe unten
- [ ] Code-Signatur kostenlos über SignPath Foundation (Open-Source-Antrag) – bis dahin SmartScreen-Warnung
- [ ] Mit echter .fit-Datei prüfen: Datum lokal + Höhen-Einheit (km→m in `fitDataToParsed`); dann `fit-file-parser` 1 → 6 updaten
- [ ] npm audit: 12 moderate übrig (jimp → file-type im Icon-Skript; sprintf-js über electron-builder) – nur Build-Werkzeuge
- [ ] Wiederherstellen-Knopf für Auto-Sicherungen in den Einstellungen
- [ ] Recovery: Befinden-Verlauf als eigene Liste/Diagramm (jetzt nur im Tooltip)
- [ ] Rückgängig für gelöschte Plan-Einheiten / Recovery-Einträge (bisher nur Aktivitäten)
- [ ] Lokaler Coach: Bericht-Länge mit echten Daten messen (Tokens) und `num_ctx` prüfen (jetzt 8192, ab langem Bericht automatisch 12288)
- [ ] Lokaler Coach: automatische Anfrage nach jedem Lauf (bewusst nicht in v1)
- [ ] Lokaler Coach: Echter Test mit eigenen Daten in der App (Dauer, Qualität), danach Merge + Release 1.1.0
- [ ] Lokaler Coach Kleinigkeiten: MARK_APPLIED mit createdAt-Abgleich, Weiterleitung eigene Fehlermeldung, Abschnitt erscheint erst nach Neu-Öffnen der Coach-Seite
