/** Wettkampfzeiten: „mm:ss“ oder „h:mm:ss“ ↔ Sekunden. */

export function parseRaceTime(s: string): number | null {
  const parts = s.trim().split(':')
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d{1,2}$/.test(p))) return null
  const nums = parts.map(Number)
  const [h, m, sec] = nums.length === 3 ? nums : [0, nums[0], nums[1]]
  if (sec >= 60 || (nums.length === 3 && m >= 60)) return null
  return h * 3600 + m * 60 + sec
}

export function formatRaceTime(sec: number): string {
  const t = Math.round(sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = String(t % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
