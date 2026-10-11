# Backlog – FitCoach

Reihenfolge laut `docs/AUDIT-2026-10.md` Abschnitt 7.

- [x] Phase 0 – Datensicherheit (2026-10-10)
- [x] Phase 1 – Fundament (2026-10-11): Electron 44, node:sqlite + WAL, Migrationen, Zod-IPC-Vertrag, Module entfernt, Pakete aktuell
- [ ] Phase 2 – Trainingsplan neu (Startdatum, Kalender, Progression, Auto-Zuordnung)
- [ ] Phase 3 – Garmin (intervals.icu-Sync, Mehrfach-Import, Duplikate, Splits)
- [ ] Phase 4 – Coach (Zonen auto, CTL/ATL/TSB, Steigerungswarnung, Prognose, Export + Änderungs-Vorschau; Export enthält Recovery/Check-ins noch NICHT)
- [ ] Phase 5 – UX & Deutsch (Onboarding, Bearbeiten/Undo, Tageswechsel 04:00, Schuh-km, Check-in → kurze Angabe im Recovery, Nav „Performance OS“ umbenennen)
- [ ] Phase 6 – Release (E2E, Windows-CI, Auto-Update, Signatur)
- [ ] Mit echter .fit-Datei prüfen, dass Datum lokal stimmt; dann `fit-file-parser` 1 → 6 updaten (Phase 3)
- [ ] npm audit: 12 moderate übrig (jimp → file-type im Icon-Skript; sprintf-js über electron-builder) – nur Build-Werkzeuge
- [ ] Wiederherstellen-Knopf für Auto-Sicherungen in den Einstellungen
