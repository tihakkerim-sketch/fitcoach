# FitCoach

Lokale Desktop-App (Windows, Electron) für Lauftraining. Deine Daten bleiben auf deinem Rechner:
kein Konto, keine Cloud, kein Abo.

## Funktionen

- **Aktivitäten:** manuell eintragen (Laufen, Rad, Kraft, Schlaf) oder Garmin-Dateien importieren.
- **Trainingspläne:** Pläne mit Phasen, Wochen und Einheiten inkl. Ziel-Zone und Dauer.
- **Recovery:** HRV, Body Battery, Schlaf-Score, Ruhepuls und ein täglicher Check-in; daraus wird ein Readiness-Wert berechnet.
- **Fortschritt:** Statistiken und Diagramme zu Umfang, Herzfrequenz und Zonen.
- **Coach-Export:** erzeugt eine Markdown-Zusammenfassung, die du in einen KI-Chat einfügst. Die Antwort kann als Plan-JSON zurück in die App importiert werden; abgeschlossene Einheiten bleiben erhalten.
- **Backup:** JSON-Export/-Import in den Einstellungen und automatische tägliche Sicherung der Datenbank.

## Entwicklung

Voraussetzung: Node.js 24 (passend zu Electron 44).

```sh
git clone https://github.com/tihakkerim-sketch/fitcoach.git
cd fitcoach
npm install
npm run dev        # startet Vite (Port 5173) und Electron
```

Weitere Befehle:

```sh
npm test                               # Unit-Tests (vitest)
npx tsc --noEmit -p tsconfig.json      # Typecheck Renderer
npx tsc --noEmit -p tsconfig.electron.json   # Typecheck Hauptprozess/DB
npm run build                          # Build
npm run dist                           # Windows-Installer nach release/
```

Hinweise für Entwickler (Gotchas, Migrationen, IPC): [`CLAUDE.md`](CLAUDE.md). Aufbau der App: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Wo liegen die Daten?

| Was | Ort |
|---|---|
| Datenbank | `%APPDATA%\FitCoach\fitcoach.db` |
| Automatische Sicherungen | `%APPDATA%\FitCoach\backups\` |

In `backups\` liegen eine Sicherung pro Tag (`fitcoach-JJJJ-MM-TT.db`, die letzten 14) und
Sicherungen vor Datenbank-Updates (`vor-migration-*.db`). Zum Wiederherstellen die App
schließen und die gewünschte `.db`-Datei als `fitcoach.db` zurückkopieren.

## Technik

Electron 44, React 18 + TypeScript + Vite, Tailwind + shadcn/ui, SQLite (`node:sqlite`) mit Drizzle ORM,
Zod, Recharts.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
