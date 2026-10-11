# Übergabe – FitCoach – 2026-10-11

## Ziel der letzten Session
Phase 2 „Trainingsplan neu“ aus `docs/AUDIT-2026-10.md` (Spec `docs/superpowers/specs/2026-10-11-trainingsplan-v2-design.md`, Plan `docs/superpowers/plans/2026-10-11-trainingsplan-v2.md`).

## Stand
- Branch `phase-2-trainingsplan` (baut auf `phase-1-fundament` auf, der auf `phase-0-datensicherheit`). **Nichts gemergt/gepusht.** Letzter Commit: `docs: übergabe 2026-10-11`.
- 2a: `src/shared/planCalendar.ts` (Datum berechnet), `legacyPlan.ts`, Migration v3 (Plan-Tabellen neu, `plan_phases` weg), Backup v5.
- 2b: IPC-Vertrag Plan v2, Auto-Zuordnung (`matchSessions.ts`), `planRead/planWrite.ts`, Coach-Export angepasst, Plan-JSON v2 + deutsche Claude-Prompts.
- 2c: Plan-Liste (Import / Leerer Plan / Anpassen), Kalender Woche × Mo–So mit Soll/Ist-km, Einheit-Dialog (Status, Zuordnung, Bearbeiten, Verschieben, Löschen), Dashboard „Heute“ + Wochenleiste.
- Geprüft: 158 Tests, beide Typechecks, Build grün. Rauchtest (Playwright, **Kopie** der echten DB): Migration ok, alter Plan = Archiv ab 18.05.2026, 13 Wochen, 91 Einheiten (32 erledigt, 4 übersprungen, 12 verknüpft) wie vorher; neuer Plan + Lauf → automatisch erledigt, Abweichung angezeigt, Löschen setzt zurück; keine Konsolenfehler. Echte DB unberührt.

## Offen / angefangen
- Adel: App starten (echte DB migriert automatisch v0→v3, Sicherung in `%APPDATA%\FitCoach\backups\`), alten Plan im Archiv ansehen, neuen Plan anlegen; dann alle drei Branches mergen + pushen.
- Kein separater Code-Review-Agent gelaufen (Kosten); Kernlogik (Migration, Zuordnung) habe ich selbst gelesen.
- Kleine Randfälle bewusst offen: Einheit „von Hand erledigt“ + später automatisch verknüpfter Lauf gilt danach als `auto` (Löschen des Laufs setzt sie wieder auf geplant). Intervall-Bearbeiten nur als JSON-Textfeld (Sekunden-Pace).
- Coach-Export zeigt den Plan nur, wenn ein Plan aktiv ist.
- Untracked `Musik.lnk`, `securityprompt.md` gehören Adel – nicht angefasst.

## Nächste sinnvolle Schritte
1. **Phase 3 Garmin / intervals.icu-Sync (empfohlen)** – dann fallen Läufe automatisch rein und die Auto-Zuordnung greift sofort. Adel braucht Gratis-Konto + API-Schlüssel → Klick-Anleitung geben.
2. Phase 4 Coach-Export (Recovery/Check-ins, Soll/Ist-Wochen, Steigerungswarnung).
3. Phase 5 UX/Deutsch (Rest der App ist noch englisch).

## Gotchas, die neu gelernt wurden
- Plan-Datum nie speichern: `src/shared/planCalendar.ts` (`src/shared` im Electron-tsconfig, kein `@/`-Alias dort).
- Zod 4: `.extend()`/`.partial()` nicht auf `.refine()`-Objekten – Refine erst am Ende anhängen.
- Unverpackte App lädt immer `http://localhost:5173` → für Rauchtests Vite starten (`npx vite --strictPort`), danach Port wieder frei machen.
- Rauchtest-Daten per `window.fitcoach.invoke(kanal, payload)` aus Playwright anlegen ist robuster als UI-Klicks.

## Wichtige Dateien
`src/shared/{planCalendar,deviation}.ts`, `electron/lib/{legacyPlan,matchSessions,planRead,planWrite}.ts`, `db/migrations.ts` (v3), `src/lib/planImport.ts`, `src/components/plans/{PlanCalendar,SessionDialog,SessionEditForm,EmptyPlanModal}.tsx`, `src/components/dashboard/*`
