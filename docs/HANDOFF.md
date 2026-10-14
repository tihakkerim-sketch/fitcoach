# Übergabe – FitCoach – 2026-10-14

## Ziel der letzten Session
Offene Schritte aus Phase 6: erstes Release veröffentlichen und Auto-Update Ende-zu-Ende prüfen.

## Stand
- **Release 1.0.0 und 1.0.1 auf GitHub veröffentlicht** (je Installer + Blockmap + `latest.yml`).
- **Auto-Update funktioniert Ende-zu-Ende:** installierte 1.0.0 hat 1.0.1 gefunden, geladen und installiert (installierte exe = 1.0.1).
- Fehler behoben: `electron-builder --publish always` hatte bei v1.0.0 **zwei Releases zum selben Tag** angelegt (paralleler Upload). Release-Workflow baut jetzt mit `--publish never` und veröffentlicht per `gh release create` mit allen drei Dateien. 1.0.0 nachträglich repariert (Blockmap umkopiert, doppeltes Release gelöscht).
- **1.0.2 veröffentlicht** (`57b0e4f`): intervals.icu-Sync fragt jetzt ab dem Datum der neuesten Aktivität in der App ab (max. 1 Jahr), nicht nur ab letztem Sync – sonst blieb die Lücke seit 19.06.26 für immer offen.
- Befund am echten Konto (nur lesend): intervals.icu enthält **0 Aktivitäten** – Garmin schickt nach dem Verbinden nur neue Läufe. Adel muss in intervals.icu „Download Old Data“ (bzw. „Import All Garmin Data“) auslösen. Garmin-Wellness-Download ist dort aus.

## Offen / angefangen
- Läufe ab 19.06.26 fehlen noch: erst nach Garmin-Verlauf-Import in intervals.icu + „Jetzt synchronisieren“ in der App.
- Keine Code-Signatur → SmartScreen-Warnung beim ersten Installieren (Backlog: SignPath Foundation).
- Echter Durchlauf mit eigenen Daten (Plan aktivieren, Schuh, Lauf-Import, Coach-Bericht) – aus Phase 5 noch offen, macht Adel selbst.

## Nächste sinnvolle Schritte
1. **Empfohlen:** Echter Durchlauf mit eigenen Daten in der installierten App; gefundene Fehler mit `/bug` melden.
2. Kleinere Backlog-Punkte angehen, z. B. Lauf-Kadenz verdoppeln (TCX/FIT liefert halbe Schrittfrequenz).
3. Neue Version veröffentlichen: Version in `package.json` erhöhen, committen, `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Gotchas, die neu gelernt wurden
- Nie `electron-builder --publish always` im Release-Workflow: paralleler Upload → mehrere Releases pro Tag. Stattdessen `--publish never` + `gh release create`.
- `--publish never` erzeugt trotzdem `latest.yml` und `.blockmap`.
- intervals.icu-Konto lässt sich nur lesend prüfen über Electron-Skript mit Kopie von `Local State` als userData (safeStorage/DPAPI) + DB-Kopie – echte Daten nie direkt.
- Tag-Push (öffentliches Release) kann von der Auto-Mode-Prüfung blockiert werden → Adel pusht dann selbst oder erlaubt es ausdrücklich.

## Wichtige Dateien
`.github/workflows/release.yml`, `package.json` (`version`, `build.publish`, `nsis.artifactName`), `electron/updater.ts`
