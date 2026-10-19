# Plan-Auto-Anpassung nach jedem Lauf – Design

Stand: 2026-10-19 · Status: Entwurf im Chat freigegeben, Spec-Review durch Kerim offen

## 1. Ziel

Heute: Lauf auswerten → Coach-Bericht kopieren → Claude → JSON zurück → übernehmen. Das ist nach
jedem Lauf zu aufwendig. Ziel: Nach jedem Lauf schlägt die App selbst eine Anpassung der nächsten
7 Tage vor; Kerim übernimmt sie mit einem Klick. Der Claude-Weg bleibt für größere Umbauten.

**Erfolg:** Nach einem Lauf braucht Kerim ≤ 10 Sekunden (Feedback + Übernehmen/Ablehnen), um einen
passend angepassten Plan zu haben. Keine Kosten, offline.

## 2. Entscheidungen (von Kerim)

| Frage | Entscheidung |
|---|---|
| Wer passt an | Regeln in der App; Claude optional über den bestehenden Bericht |
| Übernehmen | Vorschlag mit Begründung, 1 Klick Übernehmen/Ablehnen |
| Eingabe nach dem Lauf | Anstrengung 1–10 + Notiz (+ Haken „Beschwerden“) |
| Reichweite | Nur die nächsten 7 Tage (ab heute), Plan-Gerüst bleibt |

Annahmen (im Chat bestätigt): Haken „Beschwerden“ zusätzlich; höchstens EIN offener Vorschlag
(neuer ersetzt alten); ohne Feedback entsteht der Vorschlag nur aus Messdaten.

**Ergänzt nach Runna-Analyse (2026-10-19):** eine Leistungszahl steuert alle Tempo-Ziele (4a) und
Knopf „Nicht 100 %“ (4b). Keine lokale KI nötig – Runna arbeitet nach öffentlicher Beschreibung
ebenfalls mit Trainer-Vorlagen + Algorithmus, Tempo-Änderungen nur auf Bestätigung.

**Nicht im Umfang:** Claude-API-Aufruf aus der App (kostet), selbstlernende Regeln, Umbau späterer
Wochen, Nachholen ausgelassener Einheiten.

## 3. Ablauf

1. Neue Aktivität (Sync/Import/manuell) → `matchActivity` ordnet sie einer geplanten Einheit zu (besteht).
2. Renderer bekommt `onDataChanged()`; gibt es eine **zugeordnete Aktivität ohne Feedback**, die
   jünger als 3 Tage ist, öffnet sich der Dialog „Wie war's?“ (Anstrengung 1–10, Haken
   „Beschwerden“, Notiz; Knöpfe „Speichern“ / „Überspringen“). Mehrere neue Läufe → nacheinander,
   neuester zuletzt.
3. Speichern/Überspringen → IPC `ADAPT_FEEDBACK` speichert Feedback (bzw. markiert „übersprungen“)
   und erzeugt im selben Aufruf den Vorschlag (`buildProposal`).
4. Gibt es Änderungen → Karte „Plan-Vorschlag“ auf Dashboard und Plan-Seite: je Änderung
   vorher → nachher + ein Satz Begründung; Knöpfe „Übernehmen“ / „Ablehnen“.
   Keine Änderungen → kurze Meldung „Plan passt so“ (nichts gespeichert).
5. Übernehmen → `applyCoachChanges` (besteht, eine Transaktion). Wirft es (Einheit erledigt,
   verschoben, gelöscht) → Vorschlag `stale`, Meldung „Plan hat sich geändert – Vorschlag verworfen“.

## 4. Regeln (Start-Satz)

Definitionen:
- **Hart** = Einheit mit `targetHrZone ≥ 3` oder Intervall-`steps`; sonst **locker**. Ruhetag = `type 'rest'`.
- **Fenster** = geplante Einheiten (`status 'planned'`) mit Datum heute … heute+6.
- **Zu hart** (für eine lockere Einheit) = Anstrengung ≥ 8 ODER Ø-Puls über Obergrenze der Zielzone.
- **Erholung schlecht** = `recoveryTrend.hrvDeltaPct ≤ −10` ODER `form === 'overload'` ODER
  ACWR-Warnung (`acwrWarning`).

| # | Auslöser | Änderung | Priorität |
|---|---|---|---|
| R1 | Beschwerden | Harte Einheiten in den nächsten 2 Tagen → locker (Zone 2, keine steps), Umfang −30 %; ist morgen hart → stattdessen Ruhetag | 1 (höchste) |
| R2 | Lockere Einheit zu hart | Nächste harte Einheit im Fenster: Umfang −10 %; liegt sie in ≤ 48 h → +1 Tag verschieben (wenn Zieltag frei bzw. locker) | 2 |
| R3 | Erholung schlecht | Harte Einheit in ≤ 48 h → +1 Tag verschieben, sonst locker | 2 |
| R4 | Letzte 3 zugeordnete Läufe: Anstrengung ≤ 4, Puls in/unter Zone, Erholung nicht schlecht | Nächster langer Lauf im Fenster +10 % Distanz, nur wenn geplante Wochen-km danach ≤ +10 % ggü. Ø der letzten 4 Wochen | 3 |
| R5 | Leistungs-Check (Abschnitt 4a) ergibt eine neue Leistung | Eigener Vorschlag „Tempo-Ziele anpassen“ (ganzer restlicher Plan) | 3 |
| R6 | In den letzten 7 Tagen eine Einheit übersprungen/ohne Lauf | Keine Änderung; nur Hinweis in Begründungen | – |

**Konflikte:** Höhere Priorität gewinnt; eine Einheit wird höchstens von EINER Regel geändert.
Hat R1/R2/R3 gegriffen, laufen R4/R5 nicht.

### 4a. Leistungszahl + Leistungs-Check (nach Runnas „Pace Insights“)

- **Leistung** = eine aktuelle 10-km-Zeit (`user_profile.current_10k_sec`), d. h. was Kerim *heute*
  laufen könnte – nicht das Ziel. Eingabe in den Einstellungen als 5 km / 10 km / Halbmarathon,
  intern per Riegel (`riegel()` aus `src/shared/coach/prognosis.ts`) auf 10 km umgerechnet.
  Leer → App schlägt den Wert aus der vorhandenen Prognose (`predictRace`) vor.
- **Leistungs-Check** nach jeder zugeordneten harten Einheit mit Tempo-Ziel:
  - Je Einheit Verhältnis `q = Ø-Tempo / targetPaceFastSec` (bei Intervallen: Ø der Arbeits-Splits,
    wenn vorhanden, sonst Ø-Tempo). **Ausreißer** (q < 0,85 oder q > 1,20, z. B. GPS-Fehler) zählen nicht.
  - Betrachtet: letzte 3 gültigen harten Einheiten der letzten 28 Tage. Weniger als 2 → Status
    „Beobachte noch“, kein Vorschlag (Einzelläufe verschieben nie etwas).
  - **Schneller:** ≥ 2 von 3 mit q ≤ 0,97 und Anstrengung ≤ 6 → Leistung −2 % (schneller).
  - **Langsamer:** ≥ 2 von 3 mit q ≥ 1,04 und Anstrengung ≥ 7 → Leistung +2 % (langsamer).
  - Sonst Status „Passt“. Gemischt (je 1× schneller und langsamer) → „Daten uneinheitlich“.
  - Nach einer übernommenen Leistungs-Änderung zählen nur Einheiten danach (sonst Doppelzählung).
- **Wirkung beim Übernehmen:** neue Leistung speichern und Tempo-Ziele (`targetPaceFastSec`,
  `targetPaceSlowSec`) **aller** geplanten Einheiten ab heute mit `neu / alt` skalieren
  (gerundet auf ganze Sekunden). Einheiten selbst bleiben gleich. Einzige Ausnahme von der
  7-Tage-Reichweite (wie bei Runna). Manuelle Änderung der Leistung in den Einstellungen wirkt genauso.
- **Anzeige:** Karte „Tempo-Einschätzung“ auf der Plan-Seite mit Status (Beobachte noch / Passt /
  Daten uneinheitlich / Vorschlag) und Verlauf der Leistungswerte.

### 4b. Knopf „Nicht 100 %“ (nach Runna)

Auf Plan-Seite und Dashboard. Dialog: **Grund** (Krank / Beschwerden / Wenig Zeit) und
**Dauer** 1–7 Tage ab heute. Erzeugt einen normalen Vorschlag (1 Klick übernehmen):

| Grund | Einheiten im Zeitraum | Danach |
|---|---|---|
| Krank | alle → Ruhetag (`type 'rest'`, Ziele leer) | erste 2 Einheiten nach dem Zeitraum locker, Umfang −30 % (Rückkehr) |
| Beschwerden | harte → locker, alle Umfang −30 % (wie R1) | erste harte Einheit danach locker |
| Wenig Zeit | Umfang −30 %, harte Einheiten bleiben hart (kürzer) | – |

„Danach“ gilt nur innerhalb des Plans. Höchstens 10 Änderungen pro „Nicht 100 %“-Vorschlag.

**Leitplanken (nach allen Regeln geprüft, Verstoß → Änderung verwerfen):**
- Wochenumfang im Fenster ändert sich um höchstens ±10 % (Ausnahme R1: Reduktion unbegrenzt).
- Nie zwei harte Tage hintereinander (auch durch Verschieben nicht).
- Nur `planned`, Datum ≥ heute, innerhalb des Plans (sonst würde `applyCoachChanges` ohnehin werfen).
- Höchstens 5 Änderungen pro Vorschlag nach einem Lauf (Ausnahmen: Tempo-Vorschlag 4a, „Nicht 100 %“ 4b ≤ 10).

## 5. Bausteine

| Einheit | Ort | Aufgabe | Abhängigkeiten |
|---|---|---|---|
| Regel-Kern | `src/shared/adapt/rules.ts`, `types.ts`, `guards.ts`, `pace.ts` (4a), `notFull.ts` (4b) | `adaptPlan(input) → { changes: CoachChange[], reasons: Reason[] }`; rein, ohne DB/Datum-„jetzt“ | `src/shared/coach` (Zonen, Form, ACWR), `planCalendar` |
| Daten sammeln | `electron/lib/adaptData.ts` | Liest Fenster, letzte zugeordnete Läufe + Feedback, `CoachStatus` → `AdaptInput` | `coachData.ts`, `planRead.ts` |
| Vorschläge | `electron/lib/planProposals.ts` | `buildProposal`, `getOpenProposal`, `applyProposal`, `rejectProposal` (Transaktion, `stale`) | `coachChanges.ts`, `transaction.ts` |
| IPC | `electron/ipc/adapt.ts` | `ADAPT_FEEDBACK`, `ADAPT_PENDING_FEEDBACK`, `ADAPT_PROPOSAL_GET/APPLY/REJECT`, `ADAPT_NOT_FULL`, `ADAPT_PACE_STATUS`, `ADAPT_SET_PERFORMANCE` | Vertrag in `ipcContract.ts` |
| UI | `src/components/adapt/FeedbackDialog.tsx`, `ProposalCard.tsx`, `PaceStatusCard.tsx`, `NotFullDialog.tsx`; Leistung in Einstellungen | Dialog nach neuem Lauf; Karten auf Dashboard + PlanView | `invoke`, `onDataChanged` |
| Coach-Bericht | `electron/lib/coachExport.ts` | Ergänzt: Anstrengung/Notiz/Beschwerden der letzten Läufe + letzte 5 Vorschläge mit Status | – |

`Reason` = `{ sessionId?: number; rule: 'R1'…'R6' | 'PACE' | 'NOT_FULL'; text: string }` (fertiger deutscher Satz,
z. B. „Dein lockerer Lauf am Mo war mit 8/10 zu hart – Intervalle am Mi 10 % kürzer.“).

## 6. Daten

**Migration v6 `plan-adapt`** (`db/migrations.ts` + `db/schema.ts` + Test):
- `activities.pain` INTEGER (0/1, NULL = nicht gefragt)
- `activities.feedback_at` INTEGER (ms; gesetzt bei Speichern UND Überspringen → Dialog kommt nicht wieder)
- `user_profile.current_10k_sec` INTEGER (Leistung, NULL = noch nicht gesetzt)
- Tabelle `plan_proposals`: `id`, `plan_id` (FK, cascade), `activity_id` (FK, set null),
  `kind` (`run | pace | not_full`), `meta` (JSON, z. B. `{ old10kSec, new10kSec }` bzw. Grund/Dauer),
  `created_at`, `changes` (JSON, `CoachChange[]`), `reasons` (JSON), `status`
  (`open | applied | rejected | stale`), `resolved_at`.
- Neuer offener Vorschlag setzt vorhandene `open` → `stale` (eine Transaktion).

Anstrengung und Notiz nutzen die vorhandenen `activities.perceived_effort` / `notes`.

**Backup v8:** `plan_proposals` + neue Spalten in `backupFormat.ts`; v1–v7 bleiben importierbar.

## 7. Fehlerfälle

- Kein aktiver Plan / keine Zuordnung → kein Dialog, kein Vorschlag.
- Fehlende Messwerte (kein Puls, keine Erholung) → betroffene Regel greift nicht; nie raten.
- Übernehmen scheitert → `stale` + Meldung; nichts halb übernommen (Transaktion).
- Dialog geschlossen ohne Knopf → wie Überspringen.

## 8. Tests

- `src/shared/adapt/rules.test.ts`: Tabelle je Regel (greift / greift nicht / Grenzwert), Konflikte, Leitplanken.
- `pace.test.ts`: < 2 Einheiten → beobachten; Ausreißer ignoriert; 2/3 schneller → −2 %; gemischt → uneinheitlich; nur Einheiten nach letzter Änderung; Skalierung der Tempo-Ziele.
- `notFull.test.ts`: je Grund Zeitraum + „Danach“, Plan-Ende, Obergrenze 10.
- `electron/lib/planProposals.test.ts` (In-Memory-DB): Feedback → Vorschlag; Übernehmen ändert Plan;
  Plan zwischendurch geändert → `stale`; neuer Vorschlag ersetzt alten.
- `db/migrations.test.ts`: v6 auf bestehender DB.
- `backupFormat`-Test: v8 Rundreise, v7 importierbar.
- E2E `e2e/adapt.spec.ts`: Plan anlegen → TCX importieren → Dialog „Wie war's?“ 9/10 → Karte → Übernehmen → Einheit geändert.

## 9. Umsetzungsreihenfolge (grob)

1. Migration + Schema + Backup v8
2. Regel-Kern (TDD), dann Leistungs-Check (4a) und „Nicht 100 %“ (4b)
3. `adaptData` + `planProposals` + IPC
4. UI (Dialog, Karte)
5. Coach-Bericht ergänzen, E2E, Release
