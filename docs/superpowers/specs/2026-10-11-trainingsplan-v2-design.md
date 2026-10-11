# Phase 2 – Trainingsplan neu (Design)

Stand 11.10.2026. Grundlage: `docs/AUDIT-2026-10.md` Abschnitt 2.1 + 3.1.

## Ziel & Erfolg

„Heute" zeigt die richtige Einheit, der Plan ist ein Kalender mit echten Daten,
und gelaufene Läufe werden automatisch der Einheit zugeordnet (Soll/Ist sichtbar).

Erfolg heißt:
- Dashboard zeigt die Einheit mit dem **heutigen Datum** des aktiven Plans (oder „startet am …" / „beendet").
- Plan-Seite = Kalender (Woche × Mo–So) mit Datum, aktuelle Woche markiert, Soll-/Ist-km pro Woche.
- Ein neuer Lauf am Tag einer geplanten Lauf-Einheit macht diese automatisch „erledigt" + verknüpft; Abweichung sichtbar.
- Der bestehende Plan (13 Wochen, ab Mo 18.05.2026) wird ohne Verlust umgewandelt und als Archiv angezeigt.

## Entscheidungen (Adel, 11.10.2026)

| Frage | Entscheidung |
|---|---|
| Plan anlegen | Claude-JSON (Hauptweg) **+** „Leerer Plan" (Name, Ziel, Start, Anzahl Wochen); Einheiten im Kalender einzeln anlegen/bearbeiten/verschieben/löschen. Kein Vorlagen-/Progressions-Editor. |
| Zuordnung | **Automatisch**, mit einem Klick lösbar. |
| Alter Plan | Umwandeln, **als Archiv** (`isActive = 0`). |
| Annahmen | Woche beginnt Montag. Ein aktiver Plan. Typ „rest" bleibt. UI der neuen/angefassten Teile auf Deutsch. |

## Datenmodell (Migration v3)

**`training_plans`** + `start_date text NOT NULL` (YYYY-MM-DD, immer ein Montag).

**`plan_phases` entfällt.** Die Phase wird zum Text-Feld der Woche.

**`plan_weeks`** (neu aufgebaut):
| Spalte | |
|---|---|
| id | PK |
| plan_id | FK → training_plans, ON DELETE CASCADE |
| week_index | 0-basiert; UNIQUE(plan_id, week_index) |
| phase | text, z. B. „Grundlage", „Entlastung" (nullable) |
| notes | text (nullable) |

**`plan_sessions`** (neu aufgebaut):
| Spalte | |
|---|---|
| id | PK |
| week_id | FK → plan_weeks, CASCADE |
| day_of_week | 1 = Mo … 7 = So |
| type | running \| cycling \| strength \| rest \| custom |
| title | text (früher `intensity_label`) |
| target_distance_km | real |
| target_duration_min | real |
| target_pace_fast_sec / target_pace_slow_sec | int, Sekunden pro km (z. B. 330 = 5:30) |
| target_hr_zone | int 1–5 |
| steps | text, JSON (Intervalle, siehe unten) |
| coaching_note | text |
| status | planned \| completed \| skipped |
| linked_activity_id | FK → activities, ON DELETE SET NULL |
| match_source | `auto` \| `manual` \| NULL |
| completed_at, completion_note | wie bisher |

**Datum wird berechnet, nicht gespeichert:** `datum = startDate + weekIndex·7 + (dayOfWeek − 1)`.
Startdatum ändern = ganzer Plan verschiebt sich; Einheit verschieben = `day_of_week`/Woche ändern.

**„Verpasst"** ist kein Status: `planned` + Datum < heute (lokal) + Typ ≠ rest → Anzeige „verpasst".

**Intervall-Schritte (`steps`)**, mit Zod geprüft:
```
Step  = { kind: 'warmup'|'work'|'recovery'|'cooldown',
          distanceM?, durationSec?, paceFastSec?, paceSlowSec?, hrZone?, note? }
Block = Step | { repeat: 2..50, steps: Step[] }   // eine Verschachtelungsebene
steps = Block[]  (max. 30)
```
Beispiel 6 × 800 m: `[{kind:'warmup',durationSec:900}, {repeat:6, steps:[{kind:'work',distanceM:800,paceFastSec:285,paceSlowSec:295},{kind:'recovery',distanceM:400}]}, {kind:'cooldown',durationSec:600}]`

### Migration v3 (Umwandlung)

Reine Funktion `convertLegacyPlans(rows) → newRows` in `electron/lib/legacyPlan.ts`, benutzt von Migration **und** Backup-Import (v1–v4):
1. Pro Plan: Phasen nach `order_index`, darin Wochen nach `week_number` → fortlaufender `week_index`; `phase.name` → `week.phase`.
2. Felder: `intensity_label` → `title`, `target_duration_min`, `target_hr_zone`, `coaching_note`, Status, Verknüpfung, `completed_at`, `completion_note` 1:1. Vorhandene Verknüpfung → `match_source = 'manual'`.
3. **Startdatum ableiten:** für jede verknüpfte Einheit `activity.date − weekIndex·7 − (dow−1)`; häufigster Montag gewinnt. Ohne Verknüpfung: Montag der Woche von `created_at` (lokal).
4. Bestehende Pläne werden `is_active = 0` (Archiv). Erwartung echte Daten: Plan 9 → Start 18.05.2026, 13 Wochen, 91 Einheiten (32 erledigt, 4 übersprungen, 12 verknüpft).
5. Ablauf in der Migration: Tabellen neu anlegen (`_new`), Daten umwandeln, alte löschen, umbenennen; `foreign_key_check` vor Commit. Sicherung schreibt der Runner automatisch.

### Backup
Format **v5**: `trainingPlans` (mit `startDate`), `planWeeks`, `planSessions` neu; kein `planPhases`. v1–v4 bleiben importierbar: ihre Plan-Daten laufen durch `convertLegacyPlans`.

## Gemeinsame Logik (rein, getestet)

- `src/shared/planCalendar.ts` (von Main und Renderer importiert; `src/shared` in `tsconfig.electron.json` aufnehmen):
  `sessionDate(start, weekIndex, dow)`, `weekRange(start, weekIndex)`, `planEndDate`, `currentWeekIndex(start, today)`, `planState(plan, today)` → `before | running | finished`, `isMissed`, `mondayOf(date)`, Pace-Format `"5:30" ↔ 330`.
- `src/shared/deviation.ts`: Soll vs. Ist (Distanz, Dauer, Pace) → `{ field, planned, actual, pct }[]`.
- `electron/lib/matchSessions.ts`: automatische Zuordnung.
- `electron/lib/legacyPlan.ts`: Umwandlung (s. o.), auch alter JSON-Import.
- `electron/lib/planWrite.ts`: Plan anlegen/anpassen in einer Transaktion.

## Automatische Zuordnung

`matchActivity(db, activityId)` und `rematchPlan(db, planId)`; immer in `runInTransaction`.

Regeln:
- Nur der **aktive** Plan. Typen: running↔running, cycling↔cycling, strength↔strength. rest/custom nie.
- Gleiches Datum (lokal), kein ±1 Tag.
- Kandidaten: `status = planned`, oder `completed` ohne Verknüpfung. `skipped` nie.
- Eine Aktivität wird höchstens einer Einheit zugeordnet; bereits verknüpfte Aktivitäten werden übersprungen. Mehrere Kandidaten am Tag: kleinste Session-ID zuerst.
- Treffer → `status = completed`, `linked_activity_id`, `match_source = 'auto'`, `completed_at = now`.

Auslöser:
- `ACTIVITIES_CREATE` (manuell und Garmin) → `matchActivity` direkt nach dem Insert, gleiche Transaktion.
- Plan anlegen / aktivieren / Startdatum ändern / anpassen → `rematchPlan`: zuerst alle `auto`-Zuordnungen des Plans zurück auf `planned`, dann neu zuordnen. `manual` bleibt unangetastet.
- `ACTIVITIES_DELETE` → **vor** dem Löschen: `auto`-Einheiten zurück auf `planned` (Link, completed_at leer); `manual`-Einheiten verlieren nur den Link, bleiben erledigt.

Manuell: Einheit lösen (→ planned, Link weg) oder mit einer anderen Aktivität verknüpfen (`match_source = 'manual'`, completed).

## IPC (Vertrag in `ipcContract.ts`)

| Kanal | Eingabe | Ergebnis |
|---|---|---|
| `PLANS_CREATE` | Plan v2 (name, goalEvent?, goalDate?, startDate, weeks[]) | PlanRow |
| `PLANS_CREATE_EMPTY` | name, goalEvent?, goalDate?, startDate, weekCount 1–52 | PlanRow |
| `PLANS_LIST` / `PLANS_GET` / `PLANS_DELETE` / `PLANS_ACTIVATE` | wie bisher | `PlanDetail` = Plan + weeks[] + sessions[] (+ verknüpfte Aktivitäts-Kurzdaten: date, distanceKm, durationMin, avgHr) |
| `PLANS_UPDATE` | planId, name?, goalEvent?, goalDate?, startDate? | PlanRow (+ rematch bei startDate) |
| `PLANS_ADAPT` | planId + Plan v2 | `{ preserved, restored }` – erledigt/übersprungen bleiben, wenn (weekIndex, dow, type) im neuen Plan existiert; danach rematch |
| `PLAN_WEEK_UPDATE` | weekId, phase?, notes? | – |
| `SESSIONS_CREATE` | planId, weekIndex, Einheit-Felder | Session |
| `SESSIONS_UPDATE` | sessionId, Felder inkl. weekIndex/dayOfWeek (verschieben) | Session |
| `SESSIONS_DELETE` | sessionId | – |
| `SESSIONS_UPDATE_STATUS` | wie bisher | – |
| `SESSIONS_LINK_ACTIVITY` | sessionId, activityId \| null | – (manuell) |
| `PLANS_TODAY` | – | `{ plan, state, today: Session[], week: Session[] mit Datum }` für das Dashboard |

`startDate` wird mit Zod geprüft: gültiges Datum **und** Montag. `PLANS_UPDATE` nimmt zusätzlich `weekCount?` (1–52): verlängern hängt leere Wochen an; kürzen nur, wenn die wegfallenden Wochen keine Einheiten haben (sonst Fehler „Woche X enthält noch Einheiten"). `SESSIONS_CREATE`/`UPDATE` mit `weekIndex` ≥ Anzahl Wochen → Fehler.

## Plan-JSON v2 (Claude)

```json
{ "version": 2, "name": "...", "goalEvent": "...", "goalDate": "YYYY-MM-DD", "startDate": "YYYY-MM-DD",
  "weeks": [ { "phase": "Grundlage", "notes": "...",
      "sessions": [ { "day": "Mo", "type": "running", "title": "Lockerer Lauf",
          "distanceKm": 8, "durationMin": 45, "pace": "6:00-6:20", "hrZone": 2,
          "steps": [ ... ], "note": "..." } ] } ] }
```
- `day`: Mo Di Mi Do Fr Sa So (Mon…Sun wird auch angenommen).
- `startDate` optional im JSON; im Import-Dialog Pflicht (Vorschlag: nächster Montag), muss Montag sein.
- Altes Format (`phases[]` mit `weeks: n` + `sessions`, wiederholt sich) wird erkannt und in n gleiche Wochen ausgerollt.
- Neuer deutscher Prompt für Erstellen und Anpassen (Anpassen: aktueller Plan als JSON v2 wird mitgeliefert).
- Parser in `src/lib/planImport.ts` mit Zod, Fehlermeldungen auf Deutsch mit Woche/Einheit.

## Oberfläche

- **Dashboard „Heute"** (`PLANS_TODAY`): heutige Einheit(en) mit Ziel (Distanz/Pace/Intervalle kurz), Status, ggf. verknüpfter Lauf + Abweichung. Wochenleiste = echte aktuelle Kalenderwoche des Plans (Mo–So mit Datum, Status-Punkte). Zustände: kein aktiver Plan / startet am … / beendet am …
- **Plan-Seite (`PlanDetail`)**: Kopf mit Name, Ziel, Start–Ende, „Woche X von N", Startdatum ändern. Kalender: eine Zeile pro Woche (Phase, Datum, Soll-km/Ist-km), Spalten Mo–So; Karte pro Einheit mit Titel, Distanz/Dauer, Status-Farbe (geplant, erledigt, übersprungen, verpasst, heute). Aktuelle Woche markiert, beim Öffnen hinscrollen. Leerer Tag: „+".
- **Einheit-Dialog**: Ansicht (Ziele, Intervall-Schritte lesbar, verknüpfter Lauf, Abweichung) + Aktionen: erledigt/übersprungen/zurücksetzen, Zuordnung lösen / anderen Lauf wählen (Aktivitäten des Tages ±3), bearbeiten (alle Felder; Intervalle als JSON-Textfeld mit Prüfung), verschieben (Tag/Woche), löschen.
- **Plan-Liste (`PlanView`)**: „Plan aus Claude importieren", „Leerer Plan"; Karten zeigen Zeitraum + aktiv/Archiv.
- `CreatePlanModal` (alter Phasen-Editor) wird durch „Leerer Plan" ersetzt; `WeekGrid` durch den Kalender.

## Coach-Export (`summary.ts`)
Nur Umstellung aufs neue Modell: Einheiten im Export-Zeitraum mit Datum, Soll, Status, Ist. Großer Umbau = Phase 4.

## Fehlerbehandlung
- Alle Schreibvorgänge mit mehreren Schritten in `runInTransaction`.
- Import-/Bearbeiten-Fehler als deutsche Meldung im Dialog; nichts wird halb gespeichert.
- Migration: Fehler → Rollback, App startet nicht (bestehendes Verhalten), Sicherung liegt vorher in `backups/`.

## Tests
- `planCalendar`: Datum je Woche/Tag, Sommerzeit-Wechsel (Ende Okt./März), vor/läuft/beendet, verpasst, Pace-Format.
- `legacyPlan`: Umwandlung inkl. Startdatum-Ableitung (Mehrheit, Fallback), Felder 1:1.
- `migrations.test`: v2 → v3 auf Test-DB mit altem Plan; Zahlen bleiben gleich; FK-Check.
- `matchSessions`: Treffer, falscher Typ, skipped, schon verknüpft, zwei Einheiten am Tag, Löschen auto vs. manuell, Rematch nach Startdatum-Änderung.
- Backup: v4-Datei mit Phasen importieren → neues Modell; v5 Rundlauf.
- `planImport`: v2, altes Format, Fehler.
- Rauchtest (Playwright, Kopie der echten DB): Migration läuft, alter Plan im Archiv mit 18.05.2026, Leerer Plan + Einheit anlegen, Lauf anlegen → automatisch erledigt.

## Umsetzung (je ein Commit)
- **2a** Schema, Migration v3, `legacyPlan`, `planCalendar`, Backup v5.
- **2b** IPC + Vertrag, `matchSessions`, Plan-JSON v2 + Prompts, `summary.ts`.
- **2c** Oberfläche: Dashboard, Plan-Liste, Kalender, Einheit-Dialog, Import/Anpassen-Dialoge.

## Nicht in Phase 2
Plan-Vorlagen / Wochen kopieren / automatische Progression; Zuordnung ±1 Tag; Wochenkilometer-Warnung (Phase 4); restliche Übersetzung (Phase 5).
