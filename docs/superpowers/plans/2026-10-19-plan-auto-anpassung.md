# Plan-Auto-Anpassung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nach jedem Lauf (und per Knopf „Nicht 100 %“) schlägt die App regelbasiert eine Anpassung der nächsten 7 Tage bzw. der Tempo-Ziele vor; Kerim übernimmt mit einem Klick.

**Architecture:** Reine Regel-Logik in `src/shared/adapt/` (ohne DB, ohne „jetzt“) liefert `CoachChange[]` + Begründungen. `electron/lib/adaptData.ts` baut die Eingaben aus der DB, `electron/lib/planProposals.ts` speichert Vorschläge in `plan_proposals` und übernimmt sie über das vorhandene `applyCoachChanges`. Renderer: Feedback-Dialog nach neuem Lauf, Vorschlags-Karte, Tempo-Karte, „Nicht 100 %“-Dialog.

**Tech Stack:** Electron 44, React, TypeScript, Drizzle + node:sqlite, Zod 4, vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-plan-auto-anpassung-design.md`

## Global Constraints

- Datum immer lokal `YYYY-MM-DD`; Rechnen mit `addDaysStr` / `sessionDate` aus `src/shared/planCalendar.ts`; „heute“ im Main nur `appToday(db)`, im Renderer `today()`.
- `src/shared/**` darf keinen `@/`-Alias und keine DB importieren (läuft auch im Main).
- Mehrschrittige Schreibvorgänge in `runInTransaction` (`electron/lib/transaction.ts`).
- Neuer IPC-Kanal: `IPC` in `src/types/ipc.ts` + `ipcInputs` + `IpcResults` in `src/types/ipcContract.ts` + `handle(IPC.X, fn)`.
- Alle UI-Texte Deutsch. Datenänderung im Renderer danach `emitDataChanged()`.
- Reichweite Lauf-Vorschläge: Einheiten mit Datum heute … heute+6, nur `status 'planned'`.
- Höchstens 5 Änderungen pro Lauf-Vorschlag, ≤ 10 bei „Nicht 100 %“; Tempo-Vorschlag unbegrenzt (aber `coachApplySchema` gilt nicht intern).
- Höchstens EIN offener Vorschlag **je Art** (`run | pace | not_full`); ein neuer derselben Art setzt den alten auf `stale`.
- Nichts ändert sich ohne Klick auf „Übernehmen“ (außer manueller Leistungs-Eingabe in den Einstellungen).

## Review Focus

1. Plan wurde nach Vorschlags-Erstellung geändert (Einheit erledigt/gelöscht/verschoben) → Übernehmen wird `stale`, nichts halb übernommen. Test in Task 6.
2. Lauf ohne Puls, ohne Tempo-Ziel, ohne Feedback (übersprungen) → betroffene Regeln greifen nicht, kein Absturz, ggf. kein Vorschlag. Tests in Task 3 + 4.
3. Plan endet innerhalb der nächsten 7 Tage bzw. Verschieben würde hinter Planende/auf belegten harten Tag fallen → Änderung verworfen. Test in Task 2 (Leitplanken).
4. Mehrere neue Läufe auf einmal (Sync nach Tagen) → Dialog fragt jeden höchstens einmal, nur Läufe der letzten 3 Tage; Vorschlag basiert auf dem jüngsten. Test in Task 6 (`listPendingFeedback`).
5. Leistung noch nicht gesetzt → Tempo-Check zeigt „Leistung fehlt“, App schlägt Wert aus `predictRace` vor; kein Skalieren mit `null`. Test in Task 4 + 6.

---

### Task 1: Migration v6, Schema, Backup v8

**Files:**
- Modify: `db/migrations.ts` (neue Funktion `v6PlanAdapt`, Eintrag `{ version: 6, name: 'plan-adapt', up: v6PlanAdapt }`)
- Modify: `db/schema.ts` (Spalten + Tabelle `planProposals`)
- Modify: `electron/lib/backupFormat.ts` (`BACKUP_VERSION = 8`, Tabelle `planProposals` mit `since: 8` nach `planSessions`)
- Test: `db/migrations.test.ts`, vorhandener Backup-Test (`electron/lib/backup*.test.ts`)

**Interfaces:**
- Produces: `activities.pain` (`integer`, 0/1/NULL), `activities.feedbackAt` (`integer` ms), `userProfile.current10kSec` (`integer`), Tabelle `planProposals` mit `id, planId (FK cascade), activityId (FK set null), kind text ('run'|'pace'|'not_full'), meta text JSON, changes text JSON, reasons text JSON, status text default 'open' ('open'|'applied'|'rejected'|'stale'), createdAt integer, resolvedAt integer`. Index `plan_proposals_status_idx (status, kind)`.

- [ ] **Step 1: Failing tests** in `db/migrations.test.ts`: `it('v6 adds pain, feedback_at, current_10k_sec and plan_proposals')` – bestehende v5-DB migrieren, `PRAGMA table_info` enthält die drei Spalten, `INSERT INTO plan_proposals (plan_id, kind, changes, reasons, created_at)` klappt und `status` ist `'open'`; Löschen des Plans löscht den Vorschlag. Backup-Test: v8-Rundreise enthält `planProposals`; v7-Datei ohne `planProposals` importiert fehlerfrei.
- [ ] **Step 2:** `npx vitest run db/migrations.test.ts electron/lib/backup` → FAIL.
- [ ] **Step 3:** Migration (SQL im Stil von `v5ShoesFeeling`), Schema, Backup-Liste.
- [ ] **Step 4:** Tests + `npx tsc --noEmit -p tsconfig.electron.json` → PASS.
- [ ] **Step 5:** Commit `feat(adapt): Migration v6 – Feedback-Felder, Leistung, plan_proposals; Backup v8`. In `CLAUDE.md` Gotcha „Backup v7“ → „Backup v8 (plan_proposals)“.

### Task 2: Regel-Grundlagen und Leitplanken

**Files:**
- Create: `src/shared/adapt/types.ts`, `src/shared/adapt/sessions.ts`, `src/shared/adapt/guards.ts`, `src/shared/adapt/index.ts`
- Test: `src/shared/adapt/guards.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  import type { CoachChange } from '../../types/ipcContract'
  export interface AdaptSession { id: number; date: string; type: string; title: string | null
    targetDistanceKm: number | null; targetDurationMin: number | null
    targetPaceFastSec: number | null; targetPaceSlowSec: number | null
    targetHrZone: number | null; hasSteps: boolean; status: 'planned' | 'completed' | 'skipped' }
  export interface RunFeedback { activityId: number; date: string; sessionId: number | null
    sessionHard: boolean; effort: number | null; pain: boolean; avgHr: number | null
    zoneMaxHr: number | null; zoneMinHr: number | null; paceSec: number | null
    targetPaceFastSec: number | null; distanceKm: number | null }
  export interface AdaptInput { today: string; planEnd: string
    sessions: AdaptSession[]           // alle Einheiten heute-1 … heute+13 (für Nachbartage)
    recent: RunFeedback[]              // zugeordnete Läufe der letzten 28 Tage, ältester zuerst
    recoveryBad: boolean; avgWeekKmPrev28: number }
  export type RuleId = 'R1'|'R2'|'R3'|'R4'|'R6'|'PACE'|'NOT_FULL'
  export interface Reason { sessionId?: number; rule: RuleId; text: string }
  export interface AdaptResult { changes: CoachChange[]; reasons: Reason[] }
  ```
- Produces (`sessions.ts`): `isHard(s: AdaptSession): boolean` (`targetHrZone >= 3 || hasSteps`), `inWindow(s, today): boolean` (planned, today ≤ date ≤ today+6), `easyVersion(s, factor: number): CoachChange` (`update` mit `targetHrZone: 2`, `steps: null`, Distanz/Dauer × factor auf 0,1 km / 1 min gerundet), `restVersion(s): CoachChange` (`type 'rest'`, alle Ziele `null`), `plannedKm(sessions, from, to): number`.
- Produces (`guards.ts`): `applyGuards(input: AdaptInput, r: AdaptResult, opts: { maxChanges: number; unlimitedReduction: boolean }): AdaptResult` – simuliert die Änderungen auf `input.sessions` und verwirft (samt Reason) jede Änderung, die (a) eine nicht-`planned`/vergangene Einheit trifft, (b) ein Datum > `planEnd` erzeugt, (c) zwei harte Tage hintereinander erzeugt, (d) Wochen-km im Fenster um > 10 % ändert (Reduktion frei bei `unlimitedReduction`); danach auf `maxChanges` kürzen (Reihenfolge = Priorität).

- [ ] **Step 1: Failing tests** `guards.test.ts`: `drops change on completed session`, `drops move beyond planEnd`, `drops move creating back-to-back hard days`, `drops +15 % volume, keeps −30 % when unlimitedReduction`, `cuts to maxChanges keeping first`. Plus `sessions.test`-Fälle im selben File: `isHard` (Zone 3 → true, steps → true, Zone 2 → false), `easyVersion(…, 0.7)` von 10 km → 7 km, Zone 2, steps null.
- [ ] **Step 2:** `npx vitest run src/shared/adapt` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** PASS + Typecheck beide Configs.
- [ ] **Step 5:** Commit `feat(adapt): Regel-Grundlagen und Leitplanken`.

### Task 3: Regeln nach einem Lauf (R1–R4, R6)

**Files:**
- Create: `src/shared/adapt/rules.ts`
- Test: `src/shared/adapt/rules.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces: `adaptAfterRun(input: AdaptInput, run: RunFeedback): AdaptResult` (ruft am Ende `applyGuards(input, r, { maxChanges: 5, unlimitedReduction: <R1 gegriffen> })`).

Werte aus der Spec (Abschnitt 4): R1 nächste 2 Tage (heute, heute+1) harte → `easyVersion(0.7)`, ist morgen hart → `restVersion`; R2 „zu hart“ = `!run.sessionHard && (effort >= 8 || avgHr > zoneMaxHr)` → nächste harte Einheit im Fenster ×0,9, liegt sie ≤ heute+1 → `move` +1 Tag (nur wenn Zieltag keine harte Einheit hat); R3 `recoveryBad` → harte Einheit ≤ heute+1: `move` +1 Tag, sonst `easyVersion(1)`; R4 letzte 3 Läufe `effort <= 4` und `avgHr <= zoneMaxHr` (fehlende Werte → Regel greift nicht) und `!recoveryBad` → längste Lauf-Einheit im Fenster Distanz ×1,1, nur wenn `plannedKm` danach ≤ 1,1 × `avgWeekKmPrev28`; R6 übersprungene/verpasste Einheiten der letzten 7 Tage → nur `Reason`. Pro Einheit höchstens eine Regel; greift R1/R2/R3, entfällt R4. Reason-Texte deutsch, mit Wochentag (`format(…, 'EEEEEE', { locale: de })`), z. B. „Dein lockerer Lauf am Mo war mit 8/10 zu hart – Intervalle am Mi 10 % kürzer.“

- [ ] **Step 1: Failing tests** (Tabelle `it.each`): `R1 pain → hard tomorrow becomes rest`, `R1 pain → hard day after tomorrow becomes easy ×0.7`, `R2 effort 8 on easy run → next hard −10 %`, `R2 hard within 48 h → moved +1 day`, `R2 not triggered for effort 7 and hr in zone`, `R3 recoveryBad → hard tomorrow moved`, `R4 three easy runs → long run +10 %`, `R4 blocked by ramp limit`, `R4 skipped when R2 fired`, `R4 not triggered when avgHr missing`, `R6 skipped session only adds reason`, `no trigger → empty result`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(adapt): Anpassungsregeln nach einem Lauf`.

### Task 4: Leistungs-Check und Tempo-Skalierung (4a)

**Files:**
- Create: `src/shared/adapt/pace.ts`
- Test: `src/shared/adapt/pace.test.ts`

**Interfaces:**
- Consumes: `riegel(sec, fromKm, toKm)` aus `src/shared/coach/prognosis.ts`; `AdaptSession`, `RunFeedback`.
- Produces:
  ```ts
  export type PaceState = 'missing' | 'observing' | 'ok' | 'mixed' | 'faster' | 'slower'
  export interface PaceCheck { state: PaceState; used: number; current10kSec: number | null; new10kSec: number | null }
  export function to10kSec(timeSec: number, distanceKm: number): number      // riegel(…, distanceKm, 10), gerundet
  export function paceCheck(recent: RunFeedback[], current10kSec: number | null, since: string | null, today: string): PaceCheck
  export function scalePaces(sessions: AdaptSession[], today: string, factor: number): AdaptResult // rule 'PACE'
  ```
- Regeln (Spec 4a): nur `sessionHard && targetPaceFastSec && paceSec`, Datum > `since` (Datum der letzten übernommenen Leistungs-Änderung) und ≥ today−27; `q = paceSec / targetPaceFastSec`; Ausreißer q < 0,85 oder > 1,20 raus; letzte 3; < 2 → `observing`; ≥ 2 mit q ≤ 0,97 und effort ≤ 6 → `faster`, `new10kSec = round(current × 0,98)`; ≥ 2 mit q ≥ 1,04 und effort ≥ 7 → `slower`, `× 1,02`; je ≥ 1 von beiden → `mixed`; sonst `ok`. `current10kSec == null` → `missing`. `scalePaces`: alle `planned` ab today mit Tempo-Ziel → `update` fast/slow × factor, gerundet; ein Reason gesamt („Tempo-Ziele 2 % schneller – deine letzten Tempoläufe waren schneller als geplant.“).

- [ ] **Step 1: Failing tests:** `missing without performance`, `observing with one session`, `ignores outlier q 0.8`, `faster: 2 of 3 fast and easy → new10k = round(current*0.98)`, `slower: 2 of 3 slow and hard → *1.02`, `mixed`, `ignores sessions on/before since`, `to10kSec(25*60, 5)` gleich `Math.round(riegel(1500, 5, 10))`, `scalePaces factor 0.98 rounds and skips past/completed`.
- [ ] **Step 2–4:** FAIL → implementieren → PASS.
- [ ] **Step 5:** Commit `feat(adapt): Leistungs-Check und Tempo-Skalierung`.

### Task 5: „Nicht 100 %“ (4b)

**Files:**
- Create: `src/shared/adapt/notFull.ts`
- Test: `src/shared/adapt/notFull.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces: `export type NotFullReason = 'sick' | 'pain' | 'busy'`; `notFullProposal(input: AdaptInput, reason: NotFullReason, days: number /* 1–7 */): AdaptResult` (rule `'NOT_FULL'`, am Ende `applyGuards(…, { maxChanges: 10, unlimitedReduction: true })`).
- Werte (Spec 4b): Zeitraum = today … today+days−1. `sick`: alle Einheiten → `restVersion`; danach erste 2 nicht-Ruhe-Einheiten → `easyVersion(0.7)`. `pain`: harte → `easyVersion(0.7)`, lockere → Umfang ×0,7; danach erste harte → `easyVersion(1)`. `busy`: alle Umfang ×0,7, harte bleiben hart. „Danach“ nur bis `planEnd`.

- [ ] **Step 1: Failing tests:** `sick 3 days → rest + next 2 easy`, `pain → hard easy, easy −30 %, next hard after easy`, `busy keeps hard`, `after-period capped at planEnd`, `caps at 10 changes`.
- [ ] **Step 2–4:** FAIL → implementieren → PASS.
- [ ] **Step 5:** Commit `feat(adapt): „Nicht 100 %“-Vorschläge`.

### Task 6: DB-Anbindung – Eingaben, Feedback, Vorschläge, Leistung

**Files:**
- Create: `electron/lib/adaptData.ts`, `electron/lib/planProposals.ts`
- Test: `electron/lib/planProposals.test.ts` (In-Memory-DB via `makeTestDb`)

**Interfaces:**
- Consumes: `getActivePlanDetail`, `getCoachStatus`, `loadProfile` (`coachData.ts`), `effectiveZones`/`zoneOf`, `applyCoachChanges(db, { planId, changes }, today)` (`coachChanges.ts`), `predictRace`, Task 2–5.
- Produces (`adaptData.ts`):
  - `loadAdaptInput(db: TxDb, today: string): AdaptInput | null` – `null` ohne aktiven Plan. `recoveryBad = status.recovery.hrvDeltaPct <= -10 || status.form === 'overload' || status.ramp.warnings.some(w => w.kind === 'acwr')`; `avgWeekKmPrev28 = status.ramp.avgWeekKmPrev28`; `zoneMin/MaxHr` aus der Zielzone der Einheit; `paceSec`: hat die Einheit `steps` und gibt es Splits → Median der schnelleren Hälfte der `paceSecPerKm`, sonst `movingTimeMin*60 / distanceKm` (Fallback `durationMin`).
- Produces (`planProposals.ts`):
  ```ts
  export interface ProposalView { id: number; kind: 'run'|'pace'|'not_full'; createdAt: number
    changes: CoachChange[]; reasons: Reason[]; meta: Record<string, unknown> }
  export interface PendingFeedback { activityId: number; date: string; sessionTitle: string | null; distanceKm: number | null }
  export function listPendingFeedback(db, today: string): PendingFeedback[]   // zugeordnet, feedback_at NULL, date ≥ today−2, neuester zuletzt
  export function saveFeedback(db, p: { activityId: number; effort: number | null; pain: boolean; notes: string | null; skipped: boolean }, today: string, now: number): ProposalView[]
  export function createNotFullProposal(db, p: { reason: NotFullReason; days: number }, today: string, now: number): ProposalView | null
  export function listOpenProposals(db): ProposalView[]
  export function applyProposal(db, id: number, today: string, now: number): { status: 'applied' | 'stale' }
  export function rejectProposal(db, id: number, now: number): void
  export function getPaceStatus(db, today: string): PaceCheck & { suggested10kSec: number | null; history: { at: number; sec: number }[] }
  export function setPerformance(db, p: { distanceKm: number; timeSec: number }, today: string): { current10kSec: number; scaled: number }
  ```
  `saveFeedback`: in einer Transaktion Feedback schreiben (`skipped` → nur `feedback_at`), dann Lauf-Vorschlag (`adaptAfterRun`) und Tempo-Check (`paceCheck` → bei `faster`/`slower` Vorschlag `kind 'pace'`, `meta { old10kSec, new10kSec }`, changes aus `scalePaces`) speichern; leere Ergebnisse speichern nichts; Rückgabe = neu angelegte Vorschläge. `applyProposal`: `applyCoachChanges` in `runInTransaction`; bei `pace` zusätzlich `current_10k_sec = meta.new10kSec`; wirft es → Status `stale`, Rückgabe `stale` (kein Rethrow). `getPaceStatus.history` = übernommene `pace`-Vorschläge; `since` für `paceCheck` = Datum des letzten übernommenen. `setPerformance`: `to10kSec`, speichern, vorhandene Tempo-Ziele mit `neu/alt` skalieren (wenn alt gesetzt), alles in einer Transaktion.

- [ ] **Step 1: Failing tests:** `listPendingFeedback returns matched runs of last 3 days only, oldest first`; `saveFeedback skipped sets feedback_at, no dialog again`; `saveFeedback effort 9 on easy run creates run proposal`; `new run proposal marks previous open run proposal stale, keeps open pace proposal`; `applyProposal changes plan sessions`; `applyProposal after session completed → stale, plan unchanged`; `pace proposal apply sets current_10k_sec`; `getPaceStatus missing → suggested10kSec from predictRace`; `setPerformance 5 km 25:00 stores to10kSec and scales planned paces`; `createNotFullProposal sick 2 days`; `no active plan → saveFeedback returns []`.
- [ ] **Step 2–4:** FAIL → implementieren → PASS (`npx vitest run electron/lib/planProposals.test.ts`).
- [ ] **Step 5:** Commit `feat(adapt): Vorschläge speichern und übernehmen`.

### Task 7: IPC-Kanäle

**Files:**
- Modify: `src/types/ipc.ts`, `src/types/ipcContract.ts`
- Create: `electron/ipc/adapt.ts`
- Modify: `electron/main.ts` (`registerAdaptHandlers()`)
- Test: `src/types/ipcContract.test.ts` (falls vorhanden, sonst neu) – Schema-Grenzen

**Interfaces:**
- Produces Kanäle → Eingabe → Ergebnis:
  - `ADAPT_PENDING_FEEDBACK: 'adapt:pendingFeedback'` → `void` → `PendingFeedback[]`
  - `ADAPT_FEEDBACK: 'adapt:feedback'` → `{ activityId: id; effort: int 1–10 | null; pain: boolean; notes: string ≤ 2000 | null; skipped: boolean }` → `ProposalView[]`
  - `ADAPT_PROPOSALS: 'adapt:proposals'` → `void` → `ProposalView[]`
  - `ADAPT_APPLY: 'adapt:apply'` → `{ id }` → `{ status: 'applied' | 'stale' }`
  - `ADAPT_REJECT: 'adapt:reject'` → `{ id }` → `void`
  - `ADAPT_NOT_FULL: 'adapt:notFull'` → `{ reason: 'sick'|'pain'|'busy'; days: int 1–7 }` → `ProposalView | null`
  - `ADAPT_PACE_STATUS: 'adapt:paceStatus'` → `void` → Rückgabe von `getPaceStatus`
  - `ADAPT_SET_PERFORMANCE: 'adapt:setPerformance'` → `{ distanceKm: 5 | 10 | 21.0975; timeSec: int 600–14400 }` → `{ current10kSec; scaled }`
  Handler: `today = appToday(getDb())`, `now = Date.now()`.

- [ ] **Step 1: Failing test:** Schemas lehnen `effort 11`, `days 8`, `distanceKm 7` ab, akzeptieren gültige Werte.
- [ ] **Step 2–4:** FAIL → implementieren → PASS + Typecheck beide Configs.
- [ ] **Step 5:** Commit `feat(adapt): IPC-Kanäle`.

### Task 8: UI – Feedback-Dialog und Vorschlags-Karte

**Files:**
- Create: `src/components/adapt/FeedbackDialog.tsx`, `src/components/adapt/ProposalCard.tsx`, `src/components/adapt/useProposals.ts`
- Modify: `src/components/Layout.tsx` (Dialog global einhängen), `src/pages/Dashboard.tsx`, `src/pages/PlanView.tsx` (Karte oben)

**Interfaces:**
- Consumes: Kanäle aus Task 7; `onDataChanged`/`emitDataChanged`; vorhandene UI-Bausteine (`Button`, Dialog aus `src/components/ui`). Diff-Darstellung wie `src/components/coach/ChangeReview.tsx` (wiederverwenden, falls passend).
- Produces: `useProposals(): { proposals: ProposalView[]; apply(id): Promise<void>; reject(id): Promise<void> }`.

Verhalten: Dialog lädt `ADAPT_PENDING_FEEDBACK` beim Start und bei `onDataChanged`; zeigt den ältesten offenen Lauf („Wie war's? – Lauf am Mo, 6,2 km“), Regler 1–10 (Start leer), Haken „Beschwerden“, Notiz, Knöpfe „Speichern“ / „Überspringen“; Schließen = Überspringen. Nach Speichern: kommen leere Vorschläge zurück → Toast „Plan passt so“. Karte: Titel je Art („Plan-Vorschlag“, „Tempo-Ziele anpassen“, „Nicht 100 %“), Liste vorher → nachher + Begründungen, „Übernehmen“ / „Ablehnen“; `stale` → Toast „Plan hat sich geändert – Vorschlag verworfen“.

- [ ] **Step 1:** Implementieren; `npx tsc --noEmit -p tsconfig.json` grün.
- [ ] **Step 2:** Sichtprüfung: Vite + `npx electron . --user-data-dir=<temp>`, Plan + Lauf per `window.fitcoach.invoke` anlegen, Dialog → Karte → Übernehmen; Screenshot ansehen.
- [ ] **Step 3:** Commit `feat(adapt): Feedback-Dialog und Vorschlags-Karte`.

### Task 9: UI – Tempo-Karte, „Nicht 100 %“, Leistung in Einstellungen

**Files:**
- Create: `src/components/adapt/PaceStatusCard.tsx`, `src/components/adapt/NotFullDialog.tsx`, `src/components/settings/PerformanceSettings.tsx`
- Modify: `src/pages/PlanView.tsx`, `src/pages/Dashboard.tsx` (Knopf „Nicht 100 %“), `src/pages/Settings.tsx`

**Interfaces:** Consumes `ADAPT_PACE_STATUS`, `ADAPT_NOT_FULL`, `ADAPT_SET_PERFORMANCE`, `formatPace`/`formatDuration`.

Texte je Status: `missing` „Leistung fehlt – Vorschlag: 10 km in mm:ss“ + Knopf „Übernehmen“ (ruft `ADAPT_SET_PERFORMANCE` mit 10 km); `observing` „Beobachte noch (x von 2 Einheiten)“; `ok` „Passt“; `mixed` „Daten uneinheitlich“; `faster`/`slower` → Verweis auf Vorschlags-Karte. Verlauf als kleine Liste (Datum, 10-km-Zeit). Einstellungen: Distanz-Auswahl 5 km / 10 km / Halbmarathon + Zeit `mm:ss` bzw. `h:mm:ss`, Hinweis „Was du heute laufen könntest – nicht dein Ziel.“ „Nicht 100 %“: Grund (Krank / Beschwerden / Wenig Zeit), Dauer 1–7 Tage, Knopf „Vorschlag erstellen“.

- [ ] **Step 1:** Implementieren; Typecheck grün.
- [ ] **Step 2:** Sichtprüfung wie Task 8 (Leistung setzen, „Nicht 100 %“ krank 2 Tage → Karte).
- [ ] **Step 3:** Commit `feat(adapt): Tempo-Einschätzung, „Nicht 100 %“, Leistung`.

### Task 10: Coach-Bericht, E2E, Doku

**Files:**
- Modify: `electron/lib/coachExport.ts` (+ `coachExport.test.ts`)
- Create: `e2e/adapt.spec.ts`
- Modify: `CLAUDE.md` (Gotchas), `docs/BACKLOG.md`

- [ ] **Step 1: Failing test** `coachExport.test.ts`: `report lists effort, pain and notes of recent runs and last 5 proposals with status` (Abschnitt „Feedback & Anpassungen“).
- [ ] **Step 2–4:** FAIL → implementieren → PASS.
- [ ] **Step 5: E2E** `e2e/adapt.spec.ts`: Plan mit lockerer Einheit heute und harter Einheit morgen anlegen → TCX aus `e2e/fixtures` importieren → Dialog „Wie war's?“ → 9/10 speichern → Karte „Plan-Vorschlag“ sichtbar → „Übernehmen“ → harte Einheit per IPC geändert. `npm run build && npx playwright test e2e/adapt.spec.ts` → PASS.
- [ ] **Step 6:** Alles: `npx vitest run`, beide Typechecks, `npm run build`, `npx playwright test` grün.
- [ ] **Step 7:** `CLAUDE.md`-Gotcha „**Plan-Anpassung:** Regeln `src/shared/adapt`, Vorschläge `plan_proposals` (einer offen je Art), Übernehmen über `applyCoachChanges`; Leistung = `user_profile.current_10k_sec`“. Commit `feat(adapt): Coach-Bericht mit Feedback, E2E, Doku`.
