# Lokaler KI-Coach (Ollama) – Design

Stand: 2026-10-20 · Status: Entwurf, wartet auf Kerims OK

## Ziel
Der Coach-Bericht muss nicht mehr per Copy-Paste zu claude.ai. Ein Knopf „Lokalen Coach fragen“ schickt ihn an ein
lokales Modell (Ollama) auf Kerims PC. Die Antwort (Erklärung + Plan-Änderungen) landet in der vorhandenen
Vorschau „Übernehmen“. Nichts ändert sich ohne Klick. Copy-Paste bleibt als Weg erhalten.

**Ändert Entscheidung aus `docs/AUDIT-2026-10.md` §8** („KI-Coach: nur Copy-Paste, kein Ollama“) → nach OK dort nachtragen.

## Annahmen (Kerim widerspricht nur, wo es nicht passt)
1. Ollama läuft auf dem **PC** (Ryzen 5 5600, RTX 4060 mit 8 GB VRAM, 16 GB RAM, **256 GB SSD**). FitCoach läuft auf dem PC
   oder auf dem Laptop; die Ollama-Adresse ist einstellbar (Standard `http://localhost:11434`).
2. **Ein** Modell, Standard **`qwen3:8b`** (~5,2 GB, passt komplett in die 8 GB VRAM der RTX 4060). `qwen3:14b` (~9,3 GB) würde teils auf CPU/RAM ausweichen → deutlich langsamer, RAM knapp.
   Modellname ist einstellbar.
3. Das Modell **entscheidet nicht allein**: Seine Änderungen laufen durch dieselbe Prüfung wie Claudes Antworten
   (`parseCoachChanges` im Renderer, `coachApplySchema` + `applyCoachChanges` im Main). Die Regel-Anpassung
   (`src/shared/adapt`) bleibt unverändert und unabhängig.
4. Darf dauern: Lauf im Hintergrund (Main-Prozess), Seite darf gewechselt werden, Fortschritt sichtbar, abbrechbar.
5. Kein Chat, keine Mehrfach-Runden in v1 – eine Anfrage pro Knopfdruck.

## Speicherplatz (256-GB-SSD)
| Teil | Größe |
|---|---|
| Ollama (inkl. CUDA-Bibliotheken) | ~3–5 GB |
| `qwen3:8b` (Q4_K_M) | ~5,2 GB |
| Puffer (Updates, Auslagerung) | ~5 GB |
| **Gesamt** | **~15 GB frei nötig** |

- Nur ein Modell behalten; altes mit `ollama rm <name>` löschen.
- Modelle liegen unter `%USERPROFILE%\.ollama\models`; mit Umgebungsvariable `OLLAMA_MODELS` auf eine
  andere Platte verlegbar (falls später eine zweite SSD/HDD dazukommt).
- FitCoach selbst wird dadurch nicht größer (nur ein HTTP-Aufruf, kein neues npm-Paket).

## Ablauf
1. Coach-Seite → Abschnitt „Lokaler Coach“ → Zeitraum (wie Bericht) → **„Lokalen Coach fragen“**.
2. Main baut den Bericht mit `buildCoachReport` (vorhanden), schickt ihn mit System-Anweisung an
   `POST {url}/api/chat` (`stream: true`, `think: false`, `format` = JSON-Schema, `options.num_ctx` = 8192,
   `keep_alive: "10m"`).
3. Fortschritt: Status `connecting → loading_model → generating (n Zeichen) → done | error | cancelled`.
   Renderer fragt jede Sekunde ab (Muster wie `UpdateSettings`).
4. Ergebnis `{ explanation: string, fitcoachChanges: {...} }`:
   - Erklärung als Text-Karte anzeigen.
   - Änderungen als JSON in die vorhandene `ChangeReview` übergeben → gleiche Vorschau/Auswahl/„Übernehmen“.
5. Letztes Ergebnis bleibt in `app_settings` (`ollama.lastResult`) gespeichert → überlebt Seitenwechsel und Neustart.

## Antwortformat (Ollama `format`)
JSON-Schema mit `explanation` (Deutsch, max. ~1200 Zeichen) und `fitcoachChanges` (= Format aus
`COACH_CHANGES_FORMAT`, `changes` darf leer sein). Main prüft mit Zod; ungültig → **ein** zweiter Versuch mit
Fehlerhinweis, danach Status `error` mit Rohtext zum Kopieren.

## Einstellungen → „Lokaler Coach“
- Ein/Aus (Standard aus → Abschnitt auf der Coach-Seite verborgen).
- Adresse (nur `http://` / `https://`, Host + Port, ohne Pfad) – Zod-Prüfung an der IPC-Grenze.
- Modell (Auswahl aus `GET /api/tags`, Knopf „Verbindung testen“ zeigt installierte Modelle + Größe).
- Hinweis: „Der Bericht (Läufe, Puls, Erholung) wird an diese Adresse geschickt. Nur eigene Geräte eintragen.“

## Fehlerfälle
| Fall | Anzeige |
|---|---|
| PC aus / Ollama läuft nicht | „Lokaler Coach nicht erreichbar unter …. Läuft Ollama auf dem PC?“ + Copy-Paste-Weg bleibt |
| Modell nicht installiert | „Modell qwen3:8b fehlt. Auf dem PC: `ollama pull qwen3:8b`“ |
| Kein aktiver Plan | wie heute in `ChangeReview` |
| Zeitüberschreitung (15 min ohne neues Zeichen: 2 min) | `error`, abbrechbar jederzeit |
| Ungültiges JSON nach 2 Versuchen | `error` + Rohtext |

## Sicherheit / Datenschutz
- Nur Main ruft Ollama auf (Renderer-CSP bleibt `connect-src 'self'`).
- Adresse validiert; keine Weiterleitungen folgen (`redirect: 'error'`).
- Keine Secrets nötig (Ollama hat keinen Schlüssel). Antwort wird nur als Text angezeigt (kein HTML).
- Alles, was übernommen wird, läuft durch `applyCoachChanges` (Transaktion, nur Einheiten ab heute).

## Nicht in v1
Chat/Rückfragen, automatische Anfrage nach jedem Lauf, mehrere Modelle vergleichen, Mac-Version von FitCoach.

## v1.1 – Nachricht und Nachfrage
- `OLLAMA_START` nimmt zusätzlich `message` (getrimmt, höchstens 1000 Zeichen, leer = keine) und `followUp`; eine Nachfrage ohne Text wird abgelehnt.
- Die Nachricht geht als letzte User-Nachricht („Meine Nachricht: …“) an das Modell; der Bericht wird immer frisch gebaut.
- Bei einer Nachfrage kommen die vorherige Nachricht und Antwort als Verlauf davor; ohne gespeicherte Antwort läuft es als normale Anfrage.
- Das Ergebnis speichert `message` und `followUp` und zeigt sie als „Du: …“ / „Coach: …“ an. Kein dauerhafter Chat, nur der letzte Austausch.
- Verlauf: `app_settings` `ollama.history` hält die letzten 10 Antworten (neueste zuerst, mit „übernommen“-Vermerk); in der UI als aufklappbarer, schreibgeschützter Bereich „Verlauf (n)“ mit „Verlauf löschen“ (`lastResult` bleibt).
