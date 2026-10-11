/** Anleitung für Claude: Antwortformat für Plan-Änderungen (Teil des Coach-Berichts). */
export const COACH_CHANGES_FORMAT = `Antworte mit Änderungen am Trainingsplan als EIN JSON-Objekt in genau diesem Format:

{
  "fitcoachChanges": 1,
  "summary": "Kurze Begründung der Änderungen",
  "changes": [
    { "action": "update", "sessionId": 123, "set": { "distanceKm": 8, "pace": "6:00-6:20" }, "reason": "…" },
    { "action": "move",   "sessionId": 124, "date": "2026-10-16", "reason": "…" },
    { "action": "remove", "sessionId": 125, "reason": "…" },
    { "action": "add",    "date": "2026-10-18", "session": { "type": "running", "title": "…", "distanceKm": 6 }, "reason": "…" }
  ]
}

Regeln:
- "sessionId" ist die Nummer aus dem Bericht (#123).
- Nur geplante Einheiten ab heute ändern; Daten als JJJJ-MM-TT, im Plan und nicht vor heute.
- Felder in "set" und "session" wie im Plan-JSON: type (running, cycling, strength, rest, custom), title, distanceKm, durationMin, pace ("5:30" oder "5:30-5:50", schneller Wert zuerst), hrZone (1 bis 5), steps, note. In "set" nur die Felder, die sich ändern; null löscht ein Feld.
- Gib NUR das JSON aus, in einem \`\`\`json-Block oder als reinen Text.`
