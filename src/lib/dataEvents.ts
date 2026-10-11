const EVENT = 'fitcoach:data-changed'

/** Meldet: Daten (Aktivitäten, Recovery …) haben sich geändert – Listen sollen neu laden. */
export function emitDataChanged() {
  window.dispatchEvent(new CustomEvent(EVENT))
}

/** Hört auf Datenänderungen. Gibt eine Funktion zum Abmelden zurück. */
export function onDataChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}
