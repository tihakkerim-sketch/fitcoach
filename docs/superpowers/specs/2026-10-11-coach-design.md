# Phase 4 – Coach (Spec, 11.10.2026)

Ziel: aus dem Logbuch einen Coach machen. Entscheidungen aus `docs/AUDIT-2026-10.md` §8: nur Copy-Paste mit Claude (kein Ollama), Deutsch.

## Annahmen (ohne Rückfrage getroffen)
- **Zonen**: Karvonen (Herzfrequenz-Reserve) Z1 50–60 %, Z2 60–70 %, Z3 70–80 %, Z4 80–90 %, Z5 90–100 %.
  Gespeicherte Zonen (`hr_zones`) haben Vorrang; sonst werden sie aus Profil-Max-/Ruhepuls berechnet.
  Fehlt der Ruhepuls im Profil → Median der Recovery-Ruhepulse der letzten 30 Tage. Fehlt Max-Puls → höchster gemessener Max-Puls aus Läufen (nur Hinweis „geschätzt“).
- **Belastung pro Einheit**: Banister-TRIMP = Minuten × HRR × 0,64 × e^(1,92 × HRR), HRR = (Ø-Puls − Ruhe)/(Max − Ruhe), begrenzt 0…1.
  Ohne Puls: Schätzung aus Anstrengung (RPE 1–10 → HRR = 0,35 + 0,05 × RPE), sonst HRR 0,6. Schlaf zählt nicht.
- **Fitness / Ermüdung / Form**: CTL = 42-Tage-, ATL = 7-Tage-Durchschnitt (exponentiell), Form (TSB) = CTL − ATL des Vortags.
  Form-Text: > +5 „frisch“, −10…+5 „ausgeglichen“, −30…−10 „Aufbau (müde)“, < −30 „Überlastungsgefahr“.
- **Steigerungswarnung** (Wade!): Lauf-km der letzten 7 Tage vs. Ø-Woche der 28 Tage davor.
  > +10 % = Hinweis, > +30 % = Warnung. Gleiches für den längsten Lauf (vs. längster Lauf der 28 Tage davor) und für den **Plan der nächsten 7 Tage** vs. Ø der letzten 4 Wochen. Unter 10 km Ø keine Prozent-Warnung (zu wenig Basis), nur bei ≥ 3 Wochen Daten.
- **Prognose**: Riegel T2 = T1 × (D2/D1)^1,06 aus Läufen ≥ 5 km der letzten 12 Wochen; beste (schnellste) Vorhersage zählt, Basis-Lauf wird genannt.
  Zieldistanz aus Ziel-Wettkampf (Marathon 42,195 / Halbmarathon 21,0975 / „10 km“ …; Standard Marathon), Zielzeit aus Profil („4:00“, „3:59:30“, „4h“).
  Status: auf Kurs (≤ Ziel), knapp (≤ +5 %), nicht auf Kurs; dazu nötige Pace. Hinweis: Trainingsläufe unterschätzen die Wettkampfform.
- **Readiness relativ** (klein): HRV heute vs. 7-/30-Tage-Schnitt im Status und Export.

## Export (Coach-Bericht, Deutsch, kompakt)
Profil + Verletzungsnotizen, Zonen, Status (Fitness/Ermüdung/Form, Warnungen, Prognose), **diese Woche Soll vs. Ist**,
letzte 4 Wochen (km, Läufe, längster Lauf, Belastung), Recovery-Trend (HRV, Ruhepuls, Schlaf: 7 Tage vs. 30 Tage), Check-in-Notizen,
Aktivitäten im gewählten Zeitraum (mit km-Splits kompakt), **kommende 14 Tage** mit Einheiten-ID (`#123`), und Anleitung für die Antwort im Änderungs-Format.

## Änderungs-Vorschau
Claude antwortet mit
```json
{ "fitcoachChanges": 1, "summary": "…", "changes": [
  { "action": "update", "sessionId": 123, "set": { "distanceKm": 8, "pace": "6:00-6:20" }, "reason": "…" },
  { "action": "move",   "sessionId": 124, "date": "2026-10-16", "reason": "…" },
  { "action": "remove", "sessionId": 125, "reason": "…" },
  { "action": "add",    "date": "2026-10-18", "session": { "type": "running", "title": "…", "distanceKm": 6 }, "reason": "…" }
] }
```
Felder in `set`/`session` wie Plan-JSON v2 (type, title, distanceKm, durationMin, pace, hrZone, steps, note).
App zeigt jede Änderung als „Do 16.10. Lauf 10 km → 8 km“ mit Häkchen; nur angehakte werden übernommen (eine Transaktion).
Nur **geplante** Einheiten des aktiven Plans ab heute; Ziel-Datum muss im Plan liegen und ≥ heute sein. Fehlerhafte Einträge werden einzeln mit Grund angezeigt, nicht übernommen.

## Architektur
- `src/shared/coach/*` – reine Logik (Zonen, Last, Steigerung, Prognose, Status) – Main + Renderer, mit Tests.
- `electron/lib/coachData.ts` (DB → Status), `electron/lib/coachExport.ts` (Markdown), `electron/lib/coachChanges.ts` (Übernehmen).
- IPC: `COACH_STATUS`, `COACH_APPLY_CHANGES`; `EXPORT_GENERATE_SUMMARY` nutzt den neuen Bericht. `STATS_GET.trainingLoad` = TRIMP.
- Renderer: Seite „Coach“ (ersetzt „Export“): Status + Verlauf, Bericht, Antwort einfügen → Vorschau. Parser/Diff in `src/lib/coachChanges.ts`.
  Dashboard: Warnkarte. Einstellungen: Abschnitt „Puls-Zonen“ (berechnen, anpassen, speichern).
