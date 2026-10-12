# Phase 5 – gemeinsame Regeln für die UI-Pakete

- Repo: C:\Users\tihak\Desktop\FitnessTrackerApp, Branch phase-5-ux. Zuerst `CLAUDE.md` und `docs/superpowers/specs/2026-10-12-ux-deutsch-design.md` lesen.
- Shell: Git Bash. NICHT committen. Echte DB (%APPDATA%\FitCoach) nie anfassen. Kein `npm install`.
- Andere Agents arbeiten gleichzeitig an anderen Dateien: **nur die dir zugewiesenen Dateien ändern/anlegen.**
  Brauchst du eine Änderung in fremden Dateien → nicht machen, im Abschlussbericht nennen.
- Backend ist fertig (Commit b185fec). Neue IPC-Kanäle in `src/types/ipc.ts` / `src/types/ipcContract.ts`:
  ACTIVITIES_UPDATE, ACTIVITIES_RESTORE, SHOES_LIST/SAVE/DELETE, RECOVERY_SET_FEELING, ONBOARDING_STATUS/COMPLETE;
  `UserProfile.dayStartHour`, `RecoveryLog.feeling`, `ActivityRow.shoeId`, Typ `Shoe`. IPC nur über `invoke()` aus `src/lib/ipc.ts`.
- „Heute“ im Renderer: immer `today()` aus `src/lib/today.ts` (berücksichtigt Tageswechsel), nie `format(new Date(), 'yyyy-MM-dd')` oder `todayLocal()`.
  Relative Tage: `addDaysStr(today(), -6)` aus `src/shared/planCalendar.ts`. `YYYY-MM-DD` mit `T12:00:00` parsen.
- **Alles sichtbare Deutsch** (Du-Form, kurz, freundlich). Datumsanzeige mit `date-fns` + `import { de } from 'date-fns/locale'` (`format(d, 'EEE, d. MMM', { locale: de })`).
  Zahlen deutsch (`toLocaleString('de-AT')`, Komma). Einheiten: km, min, bpm, „Std.“. Fachbegriffe kurz erklären (title/Hilfetext).
  Typ-Namen: Laufen, Radfahren, Schlaf, Kraft, Sonstiges. Quelle: Manuell, Datei-Import, intervals.icu.
- Leer-Zustände: kurzer Satz, was hier erscheinen wird + ein Knopf zur passenden Aktion.
- Stil (Tailwind 4, vorhandene ui-Komponenten, Farben) beibehalten; nur Texte/Funktion ändern, kein Redesign.
- Nach Datei-Änderungen: `npx tsc --noEmit -p tsconfig.json` und `npx vitest run` (nur auf Fehler in DEINEN Dateien reagieren; fremde Baustellen melden).
- Abschlussbericht max. 15 Zeilen: geänderte Dateien, was erledigt, was offen, Fehler in fremden Dateien.
