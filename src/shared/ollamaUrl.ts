/** Nur http/https mit Host (+ Port), ohne Pfad, Query, Anker oder Zugangsdaten. */
export function normalizeOllamaUrl(input: string): string {
  let u: URL
  try { u = new URL(input.trim()) } catch { throw new Error('Ungültige Adresse') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Nur http:// oder https:// erlaubt')
  if (!u.hostname) throw new Error('Adresse ohne Host')
  if (u.username || u.password) throw new Error('Keine Zugangsdaten in der Adresse')
  if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) {
    throw new Error('Adresse darf keinen Pfad oder Parameter enthalten')
  }
  return `${u.protocol}//${u.host}`
}
