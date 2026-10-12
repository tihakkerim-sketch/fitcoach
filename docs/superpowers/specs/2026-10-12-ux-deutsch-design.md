# Phase 5 – UX & Deutsch (Spec, 12.10.2026)

Ziel laut Audit: „Öffnet man gern täglich“. Autonom umgesetzt (/goal) – Annahmen unten.

## Umfang
1. **Tageswechsel** (Standard 04:00, einstellbar 0–6 Uhr): neue Spalte `user_profile.day_start_hour` (im Backup).
   `todayLocal(now, dayStartHour)` zieht die Stunden ab. Main: `appToday(db)` (`electron/lib/today.ts`) überall statt `todayLocal()`/`new Date()`.
   Renderer: `today()` aus `src/lib/today.ts` (Stunde beim Start + nach Speichern geladen).
2. **Aktivitäten bearbeiten** (`ACTIVITIES_UPDATE`, ändert Datum/Typ → Zuordnung neu) und **Rückgängig nach Löschen**
   (Main merkt sich die letzten 10 gelöschten Aktivitäten inkl. Splits/Verlauf/Plan-Verknüpfung im Speicher → `ACTIVITIES_RESTORE(id)`; Toast mit „Rückgängig“).
3. **Schuh-Kilometer**: Tabelle `shoes` (Name, Marke, Start-km, Max-km = 700, ausgemustert, Standard), `activities.shoe_id`.
   Neue Läufe ohne Schuh bekommen den Standard-Schuh (manuell, Datei, intervals.icu). Anzeige in Einstellungen mit Balken, Hinweis ab 80 %, Warnung ab 100 %. Schuh im Lauf-Formular wählbar. Backup v7.
4. **Check-in → „Wie fühlst du dich?“** in der Recovery-Seite: Spalte `recovery_logs.feeling` (1–5). Migration übernimmt `daily_checkins.morning_energy` als Befinden (Tabelle bleibt, nichts gelöscht). Seite „Check-in“ entfällt (Route leitet auf Recovery). Coach-Bericht zeigt Befinden.
5. **Onboarding** `/willkommen`: Profil → Ziel → Puls-Zonen (Vorschau automatisch) → Tageswechsel + Laufschuh → Plan (leer anlegen / importieren / später). Erscheint nur, wenn das Profil leer ist und `onboarding_done` fehlt; in den Einstellungen erneut startbar.
6. **Deutsch überall** (inkl. Datumsformate mit `date-fns/locale/de`), Navigation neu: Übersicht · Training (Aktivitäten, Plan, Fortschritt) · Erholung · Coach · Einstellungen. „Performance OS“ → „Erholung“.
7. **Leer-Zustände** mit Handlungs-Knopf (Dashboard ohne Plan/Läufe, Aktivitäten, Fortschritt, Recovery, Coach).
8. Seiten per `lazy()` laden (Bündel-Warnung).

## Nicht in Phase 5
Readiness relativ zu HRV-Schnitt, Plan-Vorlagen, Ordner-Überwachung (bleiben im Backlog).

## Migration v5
`shoes`-Tabelle, `activities.shoe_id` (FK → shoes, ON DELETE SET NULL), `recovery_logs.feeling`, `user_profile.day_start_hour` (default 4),
Befinden aus `daily_checkins.morning_energy` übernehmen (bestehende Recovery-Zeile ergänzen, sonst neue Zeile `source='manual'`).
