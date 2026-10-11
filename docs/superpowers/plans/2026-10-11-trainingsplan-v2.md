# Trainingsplan v2 – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pläne bekommen Startdatum + Woche-für-Woche-Einheiten mit echtem Datum, Distanz/Pace/Intervallen und automatischer Zuordnung Lauf↔Einheit; „Heute" stimmt.

**Architecture:** Datum einer Einheit wird aus `startDate + weekIndex·7 + (dow−1)` berechnet (`src/shared/planCalendar.ts`, von Main und Renderer genutzt). Schreib-/Leselogik als reine Funktionen in `electron/lib/plan*.ts` (testbar mit In-Memory-DB), IPC-Handler sind dünne Hüllen. Migration v3 baut die Plan-Tabellen um; dieselbe Umwandlung (`legacyPlan.ts`) dient alten Backups.

**Tech Stack:** Electron 44, node:sqlite + Drizzle (eigener Adapter), Zod 4, React 19, Tailwind 4, date-fns 4, vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-11-trainingsplan-v2-design.md`

## Global Constraints

- Datum immer lokal: `format(d, 'yyyy-MM-dd')`; `YYYY-MM-DD` beim Parsen mit `T12:00:00` ergänzen. Nie `toISOString()` für Tage.
- Wochentage 1 = Mo … 7 = So. Woche beginnt Montag; `startDate` ist immer ein Montag.
- Mehrschrittige Schreibvorgänge in `runInTransaction` (`electron/lib/transaction.ts`, synchron).
- Neuer IPC-Kanal: `IPC` (`src/types/ipc.ts`) + `ipcInputs` + `IpcResults` (`src/types/ipcContract.ts`) + Handler via `handle()`.
- `drizzle-orm/better-sqlite3` nie importieren. `electron/lib/*` ohne `electron`-Import.
- Neue/angefasste UI-Texte und Fehlermeldungen auf Deutsch.
- Nur ein aktiver Plan: Plan anlegen/aktivieren setzt alle anderen auf `isActive = 0`.
- Echte DB (`%APPDATA%\FitCoach\fitcoach.db`) nie anfassen; Rauchtests nur mit Kopie in Temp-`--user-data-dir`.
- Prüfbefehle (Git Bash): `npx vitest run`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.electron.json`, `npm run build`.
- Commit-Nachrichten enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Sommerzeit-Wechsel (25.10.2026, 28.03.2027): `sessionDate` darf keinen Tag verrutschen → Test in Task 1.
2. Zwei Läufe am selben Tag, eine Einheit: zweiter bleibt frei; wird der erste gelöscht, bekommt der zweite die Einheit → Test in Task 6.
3. Plan verkürzen, obwohl wegfallende Wochen Einheiten haben → Fehler, nichts geändert → Test in Task 7.
4. Altes Backup (v4 mit `planPhases`) importieren → umgewandelt statt abgelehnt → Test in Task 4.
5. Ungültige Pace („5:75", „abc") im JSON/Formular → deutsche Fehlermeldung, kein Absturz → Test in Task 1 + Task 9.

---

## Gemeinsame Typen (von mehreren Tasks benutzt)

In `src/types/ipc.ts` (Task 5 legt sie an; Tasks davor nutzen eigene lokale Row-Typen):

```ts
export type MatchSource = 'auto' | 'manual'
export interface LinkedActivitySummary { id: number; date: string; type: string; distanceKm: number | null; durationMin: number | null; avgHr: number | null }
export interface PlanRow { id: number; name: string; goalEvent: string | null; goalDate: string | null; startDate: string; isActive: number; createdAt: number; weekCount: number }
export interface SessionRow {
  id: number; weekId: number; weekIndex: number; dayOfWeek: number; date: string
  type: SessionType; title: string | null
  targetDistanceKm: number | null; targetDurationMin: number | null
  targetPaceFastSec: number | null; targetPaceSlowSec: number | null; targetHrZone: number | null
  steps: PlanBlock[] | null; coachingNote: string | null
  status: SessionStatus; linkedActivityId: number | null; matchSource: MatchSource | null
  completedAt: number | null; completionNote: string | null
  activity: LinkedActivitySummary | null
}
export interface WeekDetail { id: number; planId: number; weekIndex: number; phase: string | null; notes: string | null; from: string; to: string; sessions: SessionRow[] }
export interface PlanDetail extends PlanRow { weeks: WeekDetail[] }
export type PlanState = 'none' | 'before' | 'running' | 'finished'
export interface PlanTodayResult { plan: PlanRow | null; state: PlanState; today: string; weekIndex: number | null; todaySessions: SessionRow[]; weekSessions: SessionRow[] }
export interface AdaptPlanResult { preserved: number; restored: number }
```
`PhaseDetail` entfällt.

---

## Schritt 2a – Datenbasis

### Task 1: Kalender- und Abweichungs-Logik

**Files:**
- Create: `src/shared/planCalendar.ts`, `src/shared/planCalendar.test.ts`, `src/shared/deviation.ts`, `src/shared/deviation.test.ts`
- Modify: `tsconfig.electron.json` (`"include"` um `"src/shared"` ergänzen)

**Interfaces – Produces:**
- `todayLocal(now?: Date): string`
- `isMonday(date: string): boolean`, `mondayOf(date: string): string`, `addDaysStr(date: string, n: number): string`
- `sessionDate(startDate: string, weekIndex: number, dayOfWeek: number): string`
- `weekRange(startDate: string, weekIndex: number): { from: string; to: string }`
- `planEndDate(startDate: string, weekCount: number): string` (Sonntag der letzten Woche)
- `currentWeekIndex(startDate: string, today: string): number` (darf < 0 oder ≥ weekCount sein)
- `planState(startDate: string, weekCount: number, today: string): 'before' | 'running' | 'finished'`
- `isMissed(s: { status: string; type: string }, date: string, today: string): boolean` – `planned` && `type !== 'rest'` && `date < today`
- `formatPace(sec: number): string` (330 → `"5:30"`), `parsePace(s: string): number | null` (Sekunden 0–59 sonst null), `parsePaceRange(s: string): { fast: number; slow: number } | null` (`"5:30-5:50"`, `"5:30–5:50"`, einzelner Wert → fast = slow; vertauschte Werte werden sortiert)
- `deviation.ts`: `type DeviationItem = { field: 'distance' | 'duration' | 'pace'; planned: number; actual: number; pct: number }`; `computeDeviation(planned: { targetDistanceKm?: number | null; targetDurationMin?: number | null; targetPaceFastSec?: number | null; targetPaceSlowSec?: number | null }, actual: { distanceKm?: number | null; durationMin?: number | null }): DeviationItem[]` – nur Felder, wo beide Seiten > 0; Pace: planned = Mittel fast/slow (oder der eine vorhandene), actual = `durationMin*60/distanceKm`; `pct = Math.round((actual − planned) / planned * 100)`.

- [ ] **Step 1: Tests schreiben** – u. a.:
  - `sessionDate('2026-05-18', 0, 2) === '2026-05-19'`; `sessionDate('2026-05-18', 12, 7) === '2026-08-16'`
  - DST: `sessionDate('2026-10-19', 0, 7) === '2026-10-25'`, `sessionDate('2026-10-19', 1, 1) === '2026-10-26'`; `sessionDate('2027-03-22', 1, 1) === '2027-03-29'`
  - `mondayOf('2026-10-11') === '2026-10-05'` (Sonntag), `isMonday('2026-05-18') === true`
  - `planEndDate('2026-05-18', 13) === '2026-08-16'`; `planState('2026-05-18', 13, '2026-10-11') === 'finished'`, `'2026-05-17'` → `'before'`, `'2026-05-18'` → `'running'`
  - `currentWeekIndex('2026-05-18', '2026-05-25') === 1`, `('2026-05-18','2026-05-17') === -1`
  - `parsePace('5:75') === null`, `parsePace('abc') === null`, `parsePaceRange('5:50-5:30')` → `{ fast: 330, slow: 350 }`
  - `computeDeviation({ targetDistanceKm: 16 }, { distanceKm: 11, durationMin: 66 })` → `[{ field: 'distance', planned: 16, actual: 11, pct: -31 }]`
- [ ] **Step 2:** `npx vitest run src/shared` → FAIL
- [ ] **Step 3:** Implementieren mit date-fns (`parseISO(d + 'T12:00:00')`, `addDays`, `format`).
- [ ] **Step 4:** Tests PASS, beide Typechecks grün.
- [ ] **Step 5:** Commit `feat(plan): Kalender-Logik für Plan-Daten`

### Task 2: Umwandlung alter Pläne

**Files:** Create `electron/lib/legacyPlan.ts`, `electron/lib/legacyPlan.test.ts`

**Interfaces – Produces:**
```ts
export interface LegacyPlan { id: number; name: string; goalEvent: string | null; goalDate: string | null; isActive: number; createdAt: number }
export interface LegacyPhase { id: number; planId: number; name: string; orderIndex: number; durationWeeks: number }
export interface LegacyWeek { id: number; phaseId: number; weekNumber: number; notes: string | null }
export interface LegacySession { id: number; weekId: number; dayOfWeek: number; type: string; targetDurationMin: number | null; targetHrZone: number | null; intensityLabel: string | null; coachingNote: string | null; status: string; linkedActivityId: number | null; completedAt: number | null; completionNote: string | null }
export interface NewPlanRowDb { id: number; name: string; goalEvent: string | null; goalDate: string | null; startDate: string; isActive: number; createdAt: number }
export interface NewWeekRowDb { id: number; planId: number; weekIndex: number; phase: string | null; notes: string | null }
export interface NewSessionRowDb { id: number; weekId: number; dayOfWeek: number; type: string; title: string | null; targetDistanceKm: null; targetDurationMin: number | null; targetPaceFastSec: null; targetPaceSlowSec: null; targetHrZone: number | null; steps: null; coachingNote: string | null; status: string; linkedActivityId: number | null; matchSource: 'manual' | null; completedAt: number | null; completionNote: string | null }
export function convertLegacyPlans(input: { plans: LegacyPlan[]; phases: LegacyPhase[]; weeks: LegacyWeek[]; sessions: LegacySession[]; activities: { id: number; date: string }[] }): { plans: NewPlanRowDb[]; weeks: NewWeekRowDb[]; sessions: NewSessionRowDb[] }
```
Regeln (aus Spec): Phasen nach `orderIndex`, Wochen nach `weekNumber` → `weekIndex` 0,1,2…; `phase.name` → `week.phase`, `week.notes` bleibt. Neue Week-IDs fortlaufend ab 1; Session-IDs bleiben. `intensityLabel` → `title`. `linkedActivityId` nur behalten, wenn die Aktivität existiert; dann `matchSource = 'manual'`. `dayOfWeek` außerhalb 1–7 auf 1–7 klemmen. Alle Pläne `isActive = 0`. Startdatum: je verknüpfte Einheit `mondayOf(addDaysStr(activity.date, −(weekIndex·7 + dow − 1)))`, häufigster Wert, bei Gleichstand der früheste; sonst `mondayOf(format(new Date(createdAt), 'yyyy-MM-dd'))`. Sessions/Wochen ohne Eltern werden ignoriert.

- [ ] **Step 1: Tests** – Fixture wie echter Plan: 3 Phasen à 1 Woche, verknüpfte Aktivitäten `2026-05-19` (Woche 0, dow 2), `2026-05-28` (Woche 1, dow 4), Ausreißer `2026-06-06` an Woche 2 dow 6 → Start `'2026-05-18'`. Ohne Verknüpfung, `createdAt = new Date('2026-05-20T10:00:00').getTime()` → `'2026-05-18'`. Phase mit 2 Wochen → weekIndex fortlaufend, `phase` gesetzt. `intensityLabel 'Easy run'` → `title`. Verknüpfung auf fehlende Aktivität → `linkedActivityId null`, `matchSource null`, Status bleibt. Alle `isActive === 0`. Zahl der Sessions bleibt.
- [ ] **Step 2:** FAIL → **Step 3:** implementieren → **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(plan): Umwandlung alter Phasen-Pläne`

### Task 3: Schema + Migration v3

**Files:** Modify `db/schema.ts`, `db/migrations.ts`, `db/migrations.test.ts`; Delete später nichts hier.

**Interfaces – Consumes:** `convertLegacyPlans` (Task 2). **Produces:** Drizzle-Tabellen `trainingPlans` (+ `startDate: text('start_date').notNull()`), `planWeeks` (`planId`, `weekIndex`, `phase`, `notes`), `planSessions` (Spalten laut Spec: `title`, `targetDistanceKm` real, `targetDurationMin` real, `targetPaceFastSec`, `targetPaceSlowSec`, `targetHrZone`, `steps` text, `coachingNote`, `status`, `linkedActivityId`, `matchSource`, `completedAt`, `completionNote`); `planPhases` entfernt.

DDL v3 (SQLite-12-Schritt-Umbau, FKs sind während Migration aus):
```sql
CREATE TABLE training_plans_new (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL, goal_event text, goal_date text,
  start_date text NOT NULL, is_active integer DEFAULT 1 NOT NULL, created_at integer NOT NULL);
CREATE TABLE plan_weeks_new (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  plan_id integer NOT NULL REFERENCES training_plans(id) ON DELETE cascade,
  week_index integer NOT NULL, phase text, notes text, UNIQUE(plan_id, week_index));
CREATE TABLE plan_sessions_new (id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  week_id integer NOT NULL REFERENCES plan_weeks(id) ON DELETE cascade,
  day_of_week integer NOT NULL, type text NOT NULL, title text, target_distance_km real, target_duration_min real,
  target_pace_fast_sec integer, target_pace_slow_sec integer, target_hr_zone integer, steps text, coaching_note text,
  status text DEFAULT 'planned' NOT NULL, linked_activity_id integer REFERENCES activities(id) ON DELETE set null,
  match_source text, completed_at integer, completion_note text);
-- alte Zeilen lesen (snake_case → camelCase per SELECT … AS), convertLegacyPlans, in *_new einfügen,
-- DROP plan_sessions, plan_weeks, plan_phases, training_plans; ALTER TABLE … RENAME TO …;
CREATE INDEX plan_sessions_week_idx ON plan_sessions(week_id);
CREATE INDEX plan_sessions_activity_idx ON plan_sessions(linked_activity_id);
```
Migration: `{ version: 3, name: 'plan-v2', up: v3PlanV2 }`.

- [ ] **Step 1: Tests** in `migrations.test.ts`: (a) Legacy-DB mit einem Plan (2 Phasen, 3 Wochen, 7 Sessions, 1 verknüpft am `2026-05-19` dow 2 Woche 0) → nach `runMigrations`: `user_version === 3`, 1 Plan mit `start_date '2026-05-18'`, `is_active 0`, 3 Wochen mit `week_index 0..2`, 7 Sessions, Verknüpfung + `match_source 'manual'` erhalten, Tabelle `plan_phases` existiert nicht, `foreign_key_check` leer. (b) Frische DB → v3, leere Plan-Tabellen. (c) Der bestehende Schema-Abgleichtest (schema.ts ↔ DB-Spalten) bleibt grün.
- [ ] **Step 2:** FAIL → **Step 3:** implementieren → **Step 4:** `npx vitest run db` PASS. Andere Tests, die `planPhases` importieren (`importBackup.test.ts`, `adaptPlan.test.ts`, …) dürfen bis Task 4/7 rot sein – **nicht** löschen, nur in Task 4/7 anpassen. Typecheck `tsconfig.electron.json` wird erst nach Task 7 grün.
- [ ] **Step 5:** Commit `feat(db): Migration v3 – Plan mit Startdatum und Wochen`

### Task 4: Backup v5

**Files:** Modify `electron/lib/backupFormat.ts`, `electron/lib/importBackup.ts`, `electron/lib/importBackup.test.ts`

**Interfaces – Consumes:** `convertLegacyPlans`. **Produces:** `BACKUP_VERSION = 5`; `BACKUP_TABLES` = userProfile, hrZones, activities, trainingPlans, planWeeks, planSessions, dailyCheckins, recoveryLogs (Plan-Tabellen `legacy: true`). `importBackup` akzeptiert v1–v5; bei v1–v4 werden `trainingPlans/planPhases/planWeeks/planSessions` (camelCase, wie Drizzle sie exportierte) vor der Prüfung durch `convertLegacyPlans` (mit `data.activities`) ersetzt; fehlt `planPhases` in v1–v4, gilt es als leer.

- [ ] **Step 1: Tests:** v4-Objekt mit Plan + 1 Phase + 1 Woche + 2 Sessions (eine mit verknüpfter Aktivität) → `success: true`, danach 1 Plan mit `startDate`, 1 Woche, 2 Sessions in der DB. v5-Rundlauf: `exportBackup` → `importBackup` → gleiche Zeilenzahlen und `startDate`. v5 ohne `planWeeks`-Feld → `success: false`, Daten unverändert. Unbekannte Version 6 → abgelehnt.
- [ ] **Step 2–4:** FAIL → implementieren → PASS. Header-Kommentar in `backupFormat.ts` um v5 ergänzen.
- [ ] **Step 5:** Commit `feat(backup): Format v5, alte Plan-Backups werden umgewandelt`

---

## Schritt 2b – Logik & IPC

### Task 5: IPC-Vertrag und Typen

**Files:** Modify `src/types/ipcContract.ts`, `src/types/ipc.ts`, `electron/ipc/contract.test.ts`

**Interfaces – Produces** (Zod in `ipcContract.ts`, Typen per `z.infer` exportiert):
- `planStepSchema = z.object({ kind: z.enum(['warmup','work','recovery','cooldown']), distanceM: z.number().min(1).max(100000).nullish(), durationSec: z.number().int().min(1).max(86400).nullish(), paceFastSec: paceSec.nullish(), paceSlowSec: paceSec.nullish(), hrZone: z.number().int().min(1).max(5).nullish(), note: shortText.nullish() })`, `paceSec = z.number().int().min(120).max(1200)`
- `planBlockSchema = z.union([planStepSchema, z.object({ repeat: z.number().int().min(2).max(50), steps: z.array(planStepSchema).min(1).max(10) })])`, `planStepsSchema = z.array(planBlockSchema).max(30)`; Typen `PlanStep`, `PlanBlock`.
- `mondayDate = dateString.refine(isMonday, 'Startdatum muss ein Montag sein')` (`isMonday` aus `src/shared/planCalendar`)
- `sessionFieldsSchema = z.object({ dayOfWeek 1–7, type: sessionTypeSchema, title: z.string().max(100).nullish(), targetDistanceKm: z.number().min(0).max(500).nullish(), targetDurationMin: z.number().min(0).max(1440).nullish(), targetPaceFastSec: paceSec.nullish(), targetPaceSlowSec: paceSec.nullish(), targetHrZone 1–5 nullish, steps: planStepsSchema.nullish(), coachingNote: longText.nullish() })` + Refine `fast <= slow` (Meldung „Pace: schneller Wert muss kleiner sein")
- `planWeekInputSchema = { phase: shortText.nullish(), notes: longText.nullish(), sessions: z.array(sessionFieldsSchema).max(21) }`
- `createPlanSchema = { name: shortText.min(1), goalEvent: shortText.nullish(), goalDate: dateString.nullish(), startDate: mondayDate, weeks: z.array(planWeekInputSchema).min(1).max(52) }`
- `createEmptyPlanSchema = { name, goalEvent, goalDate, startDate: mondayDate, weekCount: int 1–52 }`
- `updatePlanSchema = { planId: id, name?: shortText.min(1), goalEvent?: nullish, goalDate?: nullish, startDate?: mondayDate, weekCount?: int 1–52 }`
- `adaptPlanSchema = createPlanSchema.extend({ planId: id })`
- `updateWeekSchema = { weekId: id, phase: shortText.nullish(), notes: longText.nullish() }`
- `createSessionSchema = sessionFieldsSchema.extend({ planId: id, weekIndex: int 0–51 })`
- `updateSessionSchema = sessionFieldsSchema.partial().extend({ sessionId: id, weekIndex: int 0–51 optional })`
- `updateSessionStatusSchema`, `linkSessionActivitySchema`: unverändert.
- Neue Kanäle in `IPC`: `PLANS_CREATE_EMPTY: 'plans:createEmpty'`, `PLANS_UPDATE: 'plans:update'`, `PLANS_TODAY: 'plans:today'`, `PLAN_WEEK_UPDATE: 'planWeeks:update'`, `SESSIONS_CREATE: 'sessions:create'`, `SESSIONS_UPDATE: 'sessions:update'`, `SESSIONS_DELETE: 'sessions:delete'`.
- Ergebnisse: CREATE/CREATE_EMPTY/UPDATE → `PlanRow`; LIST → `PlanRow[]`; GET → `PlanDetail | null`; TODAY (Input `z.undefined()`) → `PlanTodayResult`; ADAPT → `AdaptPlanResult`; WEEK_UPDATE → `void`; SESSIONS_CREATE/UPDATE → `SessionRow`; SESSIONS_DELETE (Input `id`) → `void`.
- Typen aus „Gemeinsame Typen" in `src/types/ipc.ts`.

- [ ] **Step 1: Tests** in `contract.test.ts`: `createPlanSchema` lehnt `startDate '2026-10-13'` (Dienstag) ab, nimmt `'2026-10-12'`; Session mit `targetPaceFastSec 350, targetPaceSlowSec 330` abgelehnt; Steps `[{ repeat: 6, steps: [{ kind: 'work', distanceM: 800 }] }]` gültig, `repeat: 1` ungültig; jeder `IPC`-Kanal hat ein Eingabeschema (bestehender Test).
- [ ] **Step 2–4:** FAIL → implementieren → `npx vitest run electron/ipc/contract.test.ts` PASS
- [ ] **Step 5:** Commit `feat(ipc): Vertrag für Plan v2`

### Task 6: Automatische Zuordnung

**Files:** Create `electron/lib/matchSessions.ts`, `electron/lib/matchSessions.test.ts`

**Interfaces – Produces:**
- `matchActivity(db: TxDb, activityId: number, now?: number): number | null` – Session-ID oder null
- `rematchPlan(db: TxDb, planId: number, now?: number): { reset: number; matched: number }` – nur wenn Plan aktiv, sonst `{0,0}`; erst alle `auto` des Plans zurück auf planned (Link/matchSource/completedAt null), dann alle Aktivitäten im Plan-Zeitraum nach `date, startTime, id` zuordnen
- `releaseActivity(db: TxDb, activityId: number, now?: number): void` – **vor** dem Löschen aufrufen: `auto`-Sessions → planned + Link null; `manual` → nur Link/matchSource null, bleibt completed; danach `matchActivity` für die übrigen Aktivitäten desselben Datums (außer der gelöschten)
- Alle drei laufen in `runInTransaction` (verschachtelt = Savepoint, ok).

Regeln wie Spec („Automatische Zuordnung"); Datum der Session über `sessionDate`.

- [ ] **Step 1: Tests** (`makeTestDb`, Plan direkt per Drizzle anlegen, `isActive 1`, Start `2026-10-05`):
  - Lauf `2026-10-06`, Session Woche 0 dow 2 running → completed, `matchSource 'auto'`, Link gesetzt
  - Rad am selben Tag → keine Zuordnung zu running-Session
  - `skipped`-Session → bleibt skipped
  - inaktiver Plan → null
  - Lauf vor Planstart (`2026-10-04`) → null
  - zwei running-Sessions am Tag, zwei Läufe → beide zugeordnet, kleinste Session-ID zuerst
  - zwei Läufe, eine Session: zweiter bleibt frei; `releaseActivity(erster)` + Löschen → Session jetzt mit zweitem Lauf verknüpft (Review Focus 2)
  - manuell verknüpft + `releaseActivity` → bleibt completed, Link null
  - `rematchPlan` nach Startdatum-Wechsel (`startDate` per Update auf `2026-10-12`): alte auto-Zuordnung weg, `manual` bleibt
- [ ] **Step 2–4:** FAIL → implementieren → PASS
- [ ] **Step 5:** Commit `feat(plan): automatische Zuordnung Lauf ↔ Einheit`

### Task 7: Plan lesen/schreiben + IPC-Handler

**Files:**
- Create: `electron/lib/planRead.ts`, `electron/lib/planWrite.ts`, `electron/lib/planWrite.test.ts`, `electron/lib/planRead.test.ts`
- Modify: `electron/ipc/plans.ts` (komplett neu, dünne Hüllen), `electron/ipc/activities.ts` (create → `matchActivity` in derselben Transaktion; delete → `releaseActivity` dann löschen, in einer Transaktion)
- Delete: `electron/lib/adaptPlan.ts`, `electron/lib/adaptPlan.test.ts` (ersetzt durch `planWrite`)

**Interfaces – Produces:**
- `planRead.ts`: `listPlans(db): PlanRow[]` (mit `weekCount`, neueste zuerst), `getPlanDetail(db, planId): PlanDetail | null` (Wochen nach `weekIndex`, Sessions nach `dayOfWeek, id`, `date` berechnet, `steps` geparst, `activity` per Join), `getPlanToday(db, today: string): PlanTodayResult` (aktiver Plan; `state` aus `planState`; `weekSessions` = Sessions der Woche `currentWeekIndex` wenn running, sonst `[]`; `todaySessions` = davon mit `date === today`)
- `planWrite.ts`: `createPlan(db, p: CreatePlanPayload, now?): PlanRow`, `createEmptyPlan(db, p: CreateEmptyPlanPayload, now?): PlanRow`, `updatePlan(db, p: UpdatePlanPayload): PlanRow`, `activatePlan(db, planId): void`, `adaptPlan(db, p: AdaptPlanPayload): AdaptPlanResult`, `updateWeek(db, p): void`, `createSession(db, p): SessionRow`, `updateSession(db, p): SessionRow`, `deleteSession(db, id): void`, `setSessionStatus(db, p: UpdateSessionStatusPayload): void`, `linkSessionActivity(db, p: LinkSessionActivityPayload): void`
- Verhalten:
  - create/createEmpty/activate: andere Pläne `isActive 0`, dann `rematchPlan`.
  - updatePlan: `weekCount` größer → leere Wochen anhängen; kleiner → Fehler `Woche ${n} enthält noch Einheiten – zuerst löschen oder verschieben.` wenn eine wegfallende Woche Sessions hat (sonst Wochen löschen); `startDate` geändert → `rematchPlan`.
  - adaptPlan: alte Wochen+Sessions des Plans löschen, neue einfügen; completed/skipped vorher sichern und auf erste freie neue Session mit gleichem (weekIndex, dayOfWeek, type) zurückschreiben (Status, Link, matchSource, completedAt, completionNote); Name/Ziel/Start übernehmen; `rematchPlan`; Ergebnis `{ preserved, restored }`.
  - setSessionStatus: `planned` oder `skipped` → Link + matchSource leeren; `completed` → `completedAt` = Payload oder now.
  - linkSessionActivity: `null` → planned, Link/matchSource null; ID → Aktivität ggf. bei anderer Session lösen (diese → planned), dann completed + `matchSource 'manual'`.
  - createSession/updateSession: `weekIndex` ≥ Wochenanzahl → Fehler `Woche ${weekIndex + 1} gibt es in diesem Plan nicht.`; `steps` als JSON-Text speichern.
  - Alles Mehrschrittige in `runInTransaction`.
- Handler in `plans.ts`: je Kanal ein `handle(IPC.X, p => fn(getDb(), p))`; `PLANS_TODAY` mit `todayLocal()`; `PLANS_DELETE` bleibt.

- [ ] **Step 1: Tests:** createPlan mit 2 Wochen → `getPlanDetail` liefert Daten `2026-10-05`/`2026-10-12`-Wochen mit korrekten `date`s; zweiter createPlan setzt ersten inaktiv; createPlan mit Startdatum in der Vergangenheit + vorhandenem Lauf → Session sofort `auto` erledigt; updatePlan `weekCount` 3 → 1 bei Session in Woche 2 → wirft, Wochen unverändert (Review Focus 3); updatePlan verlängern → leere Wochen; adaptPlan behält erledigte Session gleicher Position (`restored 1`), verwirft nicht passende (`preserved 2, restored 1`); linkSessionActivity mit Aktivität, die schon an Session A hängt → A wieder planned; setSessionStatus skipped entfernt Link; getPlanToday: `before`/`running`/`finished`/`none`, `todaySessions` nur heutiges Datum; createSession in Woche außerhalb → Fehler.
- [ ] **Step 2–4:** FAIL → implementieren → `npx vitest run` komplett PASS; `npx tsc --noEmit -p tsconfig.electron.json` grün (außer `summary.ts`, das Task 8 behebt – falls rot, Task 8 direkt anschließen).
- [ ] **Step 5:** Commit `feat(plan): Plan lesen/schreiben, IPC-Handler, Zuordnung bei Aktivitäten`

### Task 8: Coach-Export ans neue Modell

**Files:** Modify `electron/ipc/summary.ts`

**Interfaces – Consumes:** `getPlanDetail`, `planState`, `computeDeviation`.
Plan-Abschnitt neu: Name, Ziel, Zeitraum (Start–Ende), „Woche X von N"; Tabelle aller Einheiten mit `date` im Export-Zeitraum: `| Datum | Tag | Einheit | Soll | Status | Ist |` (Soll = Distanz/Dauer/Pace/Zone kompakt; Status deutsch: geplant/erledigt/übersprungen/verpasst; Ist = Distanz + Dauer der verknüpften Aktivität). Übriger Export unverändert.

- [ ] **Step 1:** Implementieren; beide Typechecks grün; `npx vitest run` grün.
- [ ] **Step 2:** Commit `refactor(export): Coach-Export nutzt Plan v2`

### Task 9: Plan-JSON v2 + Prompts

**Files:** Rewrite `src/lib/planImport.ts`; Create `src/lib/planImport.test.ts`

**Interfaces – Produces:**
- `type ParsedPlan = { name: string; goalEvent: string | null; goalDate: string | null; startDate: string | null; weeks: CreatePlanPayload['weeks'] }`
- `parsePlanJson(raw: string): ParsedPlan` – entfernt ```-Zäune; erkennt v2 (`weeks`) und altes Format (`phases[]` mit `weeks: n` + `sessions` → n gleiche Wochen, `phase` = Phasenname, `label` → `title`); Tage `Mo Di Mi Do Fr Sa So` und `Mon…Sun`; `pace` per `parsePaceRange`; `steps`-Pace als `"4:50"`-Strings (`pace`-Feld je Step) → Sekunden; Ergebnis wird mit `planWeekInputSchema` geprüft. Fehler als `Error` mit deutscher Meldung inkl. Position, z. B. `Woche 3, Einheit 2: Pace "5:75" ist ungültig (Format 5:30 oder 5:30-5:50).`; > 52 Wochen → `Ein Plan darf höchstens 52 Wochen haben.`
- `toCreatePayload(p: ParsedPlan, startDate: string): CreatePlanPayload`
- `planToJsonV2(plan: PlanDetail): string` (gleiche Form wie Prompt-Beispiel, Pace als `"5:30-5:50"`)
- `CLAUDE_IMPORT_PROMPT: string` (deutsch, Format v2 wie Spec, Regeln: Tage, Typen, `steps`-Aufbau, nur JSON ausgeben, ein Eintrag pro Woche, Entlastungswochen + Tapering ausdrücklich erwünscht)
- `buildAdaptPrompt(plan: PlanDetail, today: string): string` (deutsch; aktueller Plan als JSON v2 + Hinweis „Woche X ist die aktuelle; vergangene Wochen unverändert lassen")

- [ ] **Step 1: Tests:** v2-Beispiel aus der Spec → 1 Woche, `targetPaceFastSec 360`, `targetPaceSlowSec 380`, `dayOfWeek 1`; altes Format mit `weeks: 3` → 3 Wochen, `phase` gesetzt; `day: 'Thu'` → 4; `pace: '5:75'` → Fehlermeldung enthält `Woche 1, Einheit 1`; 6×800-m-Steps → `{ repeat: 6, steps: [...] }`; `planToJsonV2` → `parsePlanJson` Rundlauf ergibt gleiche Wochen.
- [ ] **Step 2–4:** FAIL → implementieren → PASS
- [ ] **Step 5:** Commit `feat(plan): Plan-JSON v2 und deutsche Claude-Prompts`

---

## Schritt 2c – Oberfläche (deutsch)

Gemeinsame UI-Bausteine entstehen in Task 10 und werden in 11/12 benutzt:
- `src/components/plans/sessionFormat.ts`: `sessionTargetText(s: SessionRow): string` (z. B. `"8 km · 6:00–6:20/km · Z2"`), `stepsText(steps: PlanBlock[]): string[]` (z. B. `"6 × (800 m @ 4:50–4:55/km, 400 m Trabpause)"`), `statusLabel(s, today): { label: 'geplant'|'erledigt'|'übersprungen'|'verpasst'|'heute'; tone: 'muted'|'success'|'warning'|'danger'|'primary' }`, `TYPE_LABEL` (running Lauf, cycling Rad, strength Kraft, rest Ruhetag, custom Sonstiges), `DOW_SHORT = ['Mo','Di','Mi','Do','Fr','Sa','So']`.
- `src/components/plans/SessionDialog.tsx` (Task 11).

### Task 10: Plan-Liste, Leerer Plan, Import/Anpassen

**Files:**
- Create: `src/components/plans/sessionFormat.ts` (+ `sessionFormat.test.ts`), `src/components/plans/EmptyPlanModal.tsx`
- Modify: `src/pages/PlanView.tsx`, `src/components/plans/PlanCard.tsx`, `src/components/plans/ImportPlanModal.tsx`, `src/components/plans/AdaptPlanModal.tsx`, `src/components/plans/PlanPreview.tsx`
- Delete: `src/components/plans/CreatePlanModal.tsx`

Inhalt: PlanView mit Buttons „Plan aus Claude importieren" und „Leerer Plan"; Karten zeigen Name, Ziel, `startDate`–`planEndDate` (Format `dd.MM.yyyy`), Wochen, Badge „Aktiv"/„Archiv", Aktionen Öffnen/Aktivieren/Löschen (Löschen mit Bestätigung). EmptyPlanModal: Name, Ziel-Event, Ziel-Datum, Startdatum (Datumsfeld; Vorschlag nächster Montag; andere Tage werden per `mondayOf` auf Montag gesetzt und das wird angezeigt), Anzahl Wochen (1–52) → `PLANS_CREATE_EMPTY` → Navigation zu `/plan/:id`. ImportPlanModal: Prompt kopieren → JSON einfügen → `parsePlanJson` → Vorschau (`PlanPreview`: Wochen mit Phase, Einheiten-Kurztext) + Startdatum-Feld (aus JSON oder nächster Montag) → `PLANS_CREATE`. AdaptPlanModal: `buildAdaptPrompt` kopieren → JSON einfügen → Vorschau → `PLANS_ADAPT` → Meldung „X von Y erledigten Einheiten übernommen".

- [ ] **Step 1:** `sessionFormat.test.ts`: `sessionTargetText` für 8 km + 360–380 + Z2 → `'8 km · 6:00–6:20/km · Z2'`; `stepsText` 6×800 → enthält `'6 ×'`; `statusLabel` planned gestern → `'verpasst'`, rest gestern → `'geplant'`. FAIL → implementieren → PASS.
- [ ] **Step 2:** UI umsetzen; Renderer-Typecheck grün; `npm run build` grün.
- [ ] **Step 3:** Commit `feat(ui): Plan-Liste, leerer Plan, Import/Anpassen v2`

### Task 11: Plan-Kalender + Einheit-Dialog

**Files:**
- Create: `src/components/plans/PlanCalendar.tsx`, `src/components/plans/SessionDialog.tsx`, `src/components/plans/SessionEditForm.tsx`
- Modify: `src/pages/PlanDetail.tsx`, `src/hooks/usePlanDetail.ts`
- Delete: `src/components/plans/WeekGrid.tsx`, `src/components/plans/SessionActionModal.tsx`

Inhalt laut Spec „Plan-Seite" + „Einheit-Dialog":
- Kopf: Name, Ziel, `dd.MM.yyyy – dd.MM.yyyy`, „Woche X von N" / „startet am …" / „beendet", Aktionen „Startdatum ändern" (Dialog, → `PLANS_UPDATE`), „Wochen: N" ändern (→ `PLANS_UPDATE weekCount`, Fehlermeldung anzeigen), „Mit Claude anpassen", „Aktivieren" (wenn Archiv).
- `PlanCalendar`: Zeile je Woche: links „Woche n · Phase · dd.MM.–dd.MM." + `Soll x km / Ist y km` (Soll = Σ `targetDistanceKm` der Lauf-Einheiten, Ist = Σ `activity.distanceKm` der erledigten), Phase/Notiz per Klick editierbar (`PLAN_WEEK_UPDATE`). 7 Spalten Mo–So mit Tagesdatum; Einheiten-Kärtchen (Typ-Icon, Titel, `sessionTargetText`, Status-Farbe aus `statusLabel`); heutiger Tag umrandet; aktuelle Woche hervorgehoben und beim Laden `scrollIntoView({ block: 'center' })`; leerer Tag zeigt „+" (→ SessionDialog im Anlege-Modus). Unter ~900 px Breite: Tage untereinander statt 7 Spalten.
- `SessionDialog` Ansicht: Datum + Wochentag, Typ, Titel, Ziele, `stepsText`, Coach-Hinweis, verknüpfter Lauf (Datum, km, Dauer, Pace, Ø-HF) + `computeDeviation` als Zeilen „Distanz 16 km → 11 km (−31 %)", Badge „automatisch zugeordnet". Aktionen: „Erledigt", „Übersprungen", „Zurücksetzen" (`SESSIONS_UPDATE_STATUS`), „Zuordnung lösen" / „Lauf wählen" (Liste `ACTIVITIES_LIST` mit `dateFrom/dateTo` = Datum ±3 Tage → `SESSIONS_LINK_ACTIVITY`), „Bearbeiten", „Löschen" (Bestätigung).
- `SessionEditForm` (react-hook-form wie bestehende Formulare): Woche (Select 1–N), Tag (Mo–So), Typ, Titel, Distanz km, Dauer min, Pace „5:30-5:50" (Text, `parsePaceRange`, Fehlermeldung bei ungültig), HF-Zone, Intervalle (Textfeld JSON, mit `planStepsSchema.safeParse` prüfen, Fehler anzeigen), Coach-Hinweis → `SESSIONS_CREATE` / `SESSIONS_UPDATE`.
- Nach jeder Aktion `refresh()`.

- [ ] **Step 1:** Umsetzen; Renderer-Typecheck + Build grün.
- [ ] **Step 2:** Commit `feat(ui): Plan als Kalender mit Einheit-Dialog`

### Task 12: Dashboard „Heute"

**Files:** Modify `src/pages/Dashboard.tsx` (Plan-Teil in neue Datei `src/components/dashboard/TodayPlanCard.tsx` + `src/components/dashboard/PlanWeekStrip.tsx` auslagern; alte `flatSessions`-Logik entfernen)

Inhalt: `PLANS_TODAY` laden. `none` → „Kein aktiver Plan" + Link „Plan anlegen" (`/plan`). `before` → „Plan „Name" startet am dd.MM.yyyy". `finished` → „Plan beendet am dd.MM.yyyy" + Link zur Plan-Liste. `running` → Karte „Heute · Wochentag dd.MM." mit jeder heutigen Einheit (Titel, `sessionTargetText`, `stepsText`, Coach-Hinweis, Status; erledigt → verknüpfter Lauf + Abweichung), Klick öffnet `SessionDialog`; keine Einheit → „Heute ist frei". `PlanWeekStrip`: Mo–So der aktuellen Woche mit Datum, Kurz-Titel, Status-Punkt (Farben aus `statusLabel`), heute hervorgehoben, Klick → `SessionDialog`. Übriges Dashboard unverändert.

- [ ] **Step 1:** Umsetzen; Renderer-Typecheck + Build grün; `npx vitest run` grün.
- [ ] **Step 2:** Commit `feat(ui): Dashboard zeigt echte heutige Einheit`

### Task 13: Rauchtest, Doku, Abschluss

**Files:** Modify `CLAUDE.md` (Gotchas: Plan-Datum berechnet, `src/shared`, Backup v5), `ARCHITECTURE.md` (Plan-Modell), `docs/BACKLOG.md` (Phase 2 abhaken), Create `scripts/smoke-plan.mjs` (nicht in Build).

- [ ] **Step 1:** Port 5173 frei machen, Kopie von `%APPDATA%\FitCoach\fitcoach.db` in Temp-Ordner; `npm run build`; Playwright `_electron.launch({ args: ['.', '--user-data-dir=<temp>'] })`: Migration läuft (keine Konsolenfehler), Plan-Liste zeigt „Marathon Base to Finish" als Archiv mit `18.05.2026`; Plan öffnen → 13 Wochen, Woche 1 Di zeigt erledigt + verknüpften Lauf 3,1 km; „Leerer Plan" ab nächstem Montag mit 4 Wochen anlegen, Lauf-Einheit Mo mit 8 km anlegen; Aktivität (Lauf, dieses Datum, 7 km) manuell anlegen → Einheit erledigt, Abweichung „−13 %"; Dashboard zeigt Zustand passend. Screenshots in Scratchpad.
- [ ] **Step 2:** Alle Prüfbefehle grün.
- [ ] **Step 3:** Commit `docs: Phase 2 Doku + Rauchtest`
