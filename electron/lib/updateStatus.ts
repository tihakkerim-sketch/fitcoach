import type { UpdateStatus } from '../../src/types/ipc'

/** Ereignisse des electron-updater, auf das Nötigste reduziert (ohne electron-Import testbar). */
export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; error: unknown }

export const initialUpdateStatus: UpdateStatus = { state: 'idle' }

export const disabledUpdateStatus: UpdateStatus = {
  state: 'disabled',
  message: 'Updates nur in der installierten App',
}

/** Wandelt einen Fehler in eine verständliche deutsche Meldung um. */
export function updateErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_INTERNET|ERR_NETWORK|EAI_AGAIN|net::/i.test(raw)) {
    return 'Keine Verbindung zum Update-Server. Bitte Internetverbindung prüfen.'
  }
  if (/404|Not Found|latest\.yml|No published versions/i.test(raw)) {
    return 'Es wurde noch keine Update-Version veröffentlicht.'
  }
  if (/403|rate limit/i.test(raw)) {
    return 'Update-Server ist gerade nicht erreichbar (Limit erreicht). Später erneut versuchen.'
  }
  return 'Update-Prüfung fehlgeschlagen.'
}

/** Reiner Reducer: alter Status + Ereignis = neuer Status. */
export function reduceUpdateStatus(prev: UpdateStatus, event: UpdateEvent): UpdateStatus {
  switch (event.type) {
    case 'checking':
      // Ein bereits geladenes Update bleibt bestehen
      return prev.state === 'downloaded' ? prev : { state: 'checking' }
    case 'available':
      return { state: 'available', version: event.version }
    case 'not-available':
      return { state: 'not-available' }
    case 'progress': {
      const percent = Math.max(0, Math.min(100, Math.round(event.percent)))
      return { state: 'downloading', version: prev.version, percent }
    }
    case 'downloaded':
      return { state: 'downloaded', version: event.version }
    case 'error':
      return { state: 'error', version: prev.version, message: updateErrorMessage(event.error) }
  }
}
