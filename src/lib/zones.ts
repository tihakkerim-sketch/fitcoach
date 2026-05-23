import type { HrZone } from '../types/ipc'

export function calculateHrZones(maxHr: number): Omit<HrZone, 'id'>[] {
  return [
    { zoneNumber: 1, minHr: Math.round(maxHr * 0.5),  maxHr: Math.round(maxHr * 0.6),  label: 'Zone 1 – Recovery' },
    { zoneNumber: 2, minHr: Math.round(maxHr * 0.6),  maxHr: Math.round(maxHr * 0.7),  label: 'Zone 2 – Aerobic Base' },
    { zoneNumber: 3, minHr: Math.round(maxHr * 0.7),  maxHr: Math.round(maxHr * 0.8),  label: 'Zone 3 – Aerobic' },
    { zoneNumber: 4, minHr: Math.round(maxHr * 0.8),  maxHr: Math.round(maxHr * 0.9),  label: 'Zone 4 – Threshold' },
    { zoneNumber: 5, minHr: Math.round(maxHr * 0.9),  maxHr: maxHr,                     label: 'Zone 5 – VO2 Max' },
  ]
}

export function hrToZone(hr: number, zones: HrZone[]): number {
  const sorted = [...zones].sort((a, b) => a.zoneNumber - b.zoneNumber)
  for (const z of sorted) {
    if (hr >= z.minHr && hr <= z.maxHr) return z.zoneNumber
  }
  return hr < (sorted[0]?.minHr ?? 0) ? 1 : 5
}
