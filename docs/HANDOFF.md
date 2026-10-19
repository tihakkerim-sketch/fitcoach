# Übergabe – FitCoach – 2026-10-14

## Ziel der letzten Session
Offene Schritte aus Phase 6: erstes Release veröffentlichen und Auto-Update Ende-zu-Ende prüfen.

## Stand
- **Release 1.0.0 und 1.0.1 auf GitHub veröffentlicht** (je Installer + Blockmap + `latest.yml`).
- **Auto-Update funktioniert Ende-zu-Ende:** installierte 1.0.0 hat 1.0.1 gefunden, geladen und installiert (installierte exe = 1.0.1).
- Fehler behoben: `electron-builder --publish always` hatte bei v1.0.0 **zwei Releases zum selben Tag** angelegt (paralleler Upload). Release-Workflow baut jetzt mit `--publish never` und veröffentlicht per `gh release create` mit allen drei Dateien. 1.0.0 nachträglich repariert (Blockmap umkopiert, doppeltes Release gelöscht).
- **1.0.2 veröffentlicht** (`57b0e4f`): intervals.icu-Sync fragt jetzt ab dem Datum der neuesten Aktivität in der App ab (max. 1 Jahr), nicht nur ab letztem Sync – sonst blieb die Lücke seit 19.06.26 für immer offen.
- **1.0.3** (`f84405b`): Zeitraum ab der neuesten Aktivität, die NICHT von intervals.icu kam (max. 1 Jahr) – sonst schloss ein Sync-Lauf (13.10.) die Lücke, bevor intervals.icu den Garmin-Verlauf nachlud. Probelauf auf DB-Kopie mit echtem Konto: 7 Läufe (Aug + 08./11.10.) neu, 19.06. als Duplikat erkannt, keine Doppelten.
- Befund am echten Konto (nur lesend): intervals.icu enthält **0 Aktivitäten** – Garmin schickt nach dem Verbinden nur neue Läufe. Kerim muss in intervals.icu „Download Old Data“ (bzw. „Import All Garmin Data“) auslösen. Garmin-Wellness-Download ist dort aus.

## Offen / angefangen
- Kerim muss 1.0.3 installieren + „Jetzt synchronisieren“ → 7 fehlende Läufe kommen. Juni bewusst ausgelassen (Schwimmen 04.06. ohne Distanz/Startzeit würde doppelt).
- Keine Code-Signatur → SmartScreen-Warnung beim ersten Installieren (Backlog: SignPath Foundation).
- Echter Durchlauf mit eigenen Daten (Plan aktivieren, Schuh, Lauf-Import, Coach-Bericht) – aus Phase 5 noch offen, macht Kerim selbst.

## Nächste sinnvolle Schritte
1. **Empfohlen:** Echter Durchlauf mit eigenen Daten in der installierten App; gefundene Fehler mit `/bug` melden.
2. Kleinere Backlog-Punkte angehen, z. B. Lauf-Kadenz verdoppeln (TCX/FIT liefert halbe Schrittfrequenz).
3. Neue Version veröffentlichen: Version in `package.json` erhöhen, committen, `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Gotchas, die neu gelernt wurden
- Nie `electron-builder --publish always` im Release-Workflow: paralleler Upload → mehrere Releases pro Tag. Stattdessen `--publish never` + `gh release create`.
- `--publish never` erzeugt trotzdem `latest.yml` und `.blockmap`.
- Sync-Probelauf gegen echtes Konto: Electron-Skript entschlüsselt Schlüssel (Kopie von `Local State`) und startet temporären vitest-Test mit `PROBE_DB=<DB-Kopie>`.
- intervals.icu-Konto lässt sich nur lesend prüfen über Electron-Skript mit Kopie von `Local State` als userData (safeStorage/DPAPI) + DB-Kopie – echte Daten nie direkt.
- Tag-Push (öffentliches Release) kann von der Auto-Mode-Prüfung blockiert werden → Kerim pusht dann selbst oder erlaubt es ausdrücklich.

## Wichtige Dateien
`.github/workflows/release.yml`, `package.json` (`version`, `build.publish`, `nsis.artifactName`), `electron/updater.ts`
