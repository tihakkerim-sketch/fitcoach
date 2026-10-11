# Übergabe – FitCoach – 2026-10-11

## Ziel der letzten Session
Phase 4 „Coach“ aus `docs/AUDIT-2026-10.md` (Spec `docs/superpowers/specs/2026-10-11-coach-design.md`).

## Stand
- Committet auf Branch `phase-3-garmin` (Kette phase-0 → 1 → 2 → 3, kein eigener Phase-4-Branch). **Nichts gemergt/gepusht.**
- Puls-Zonen: automatisch nach Karvonen aus Max-/Ruhepuls (Profil, sonst Recovery-Median bzw. höchster gemessener Puls); eigene Zonen in Einstellungen → „Puls-Zonen“.
- Belastung = TRIMP pro Aktivität; Fitness/Ermüdung/Form (CTL 42 T, ATL 7 T, TSB); Progress-Seite nutzt jetzt auch TRIMP.
- Steigerungswarnungen: Wochen-km, längster Lauf, Plan nächste 7 Tage (je > 10 % Hinweis, > 30 % Warnung), ATL/CTL > 1,5.
- Prognose (Riegel) aus Läufen ≥ 5 km der letzten 12 Wochen vs. Zielzeit aus Profil.
- Neue Seite „Coach“ (ersetzt „Export“): Status + 90-Tage-Verlauf, Warnungen, Prognose, Recovery-Trend, Coach-Bericht (Deutsch, mit `#ID` der kommenden Einheiten + Antwort-Format), „Antwort von Claude einfügen“ → Vorschau mit Häkchen → Übernehmen (eine Transaktion, nur geplante Einheiten ab heute).
- Dashboard: Form-Karte mit erster Warnung.
- Geprüft: 309 Tests, beide Typechecks, Build grün. Rauchtest (Playwright) mit Kopie der echten DB + Testdaten im Temp-Ordner: Status, Warnungen, Prognose, Bericht, Änderung übernommen, Zonen-Einstellungen, keine Konsolenfehler. Echte DB unberührt.

## Offen / angefangen
- Echte Daten: letzter Lauf 19.06. → Coach zeigt aktuell kaum etwas (Form ≈ 0, keine Prognose). Kein aktiver Plan in der echten DB.
- Rest der App noch teils Englisch (Settings-Labels, Dashboard) → Phase 5.
- JS-Bündel > 500 kB (nur Warnung).

## Nächste sinnvolle Schritte
1. **Phase 5 UX & Deutsch (empfohlen)**: Onboarding, Bearbeiten/Undo, Deutsch überall, Tageswechsel 04:00.
2. Adel: App starten, Plan aktivieren, Coach-Bericht an Claude, Antwort einfügen – echter Durchlauf.
3. Branches mergen + pushen.

## Gotchas, die neu gelernt wurden
- Coach-Logik liegt rein in `src/shared/coach` (Main + Renderer); `COACH_CHANGES_FORMAT` dort, damit der Bericht (Main) es nutzen kann.
- Claude-Änderungen verweisen per `sessionId` (`#123` im Bericht) – Datum allein ist nicht eindeutig (mehrere Einheiten pro Tag möglich).
- Playwright: `fullPage`-Screenshot erfasst die innere ScrollArea nicht – Ergebnis per `invoke` prüfen.

## Wichtige Dateien
`src/shared/coach/*`, `electron/lib/{coachData,coachExport,coachChanges}.ts`, `electron/ipc/{coach,summary,stats}.ts`, `src/lib/coachChanges.ts`, `src/pages/Coach.tsx`, `src/components/coach/*`, `src/components/settings/HrZonesSettings.tsx`, `src/components/dashboard/CoachCard.tsx`
