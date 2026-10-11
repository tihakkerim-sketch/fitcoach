import { describe, it, expect } from 'vitest'
import { computeSplits, elevation, downsampleStreams, type Sample } from './activityDetails'

/** Gleichmäßiger Lauf: `paceSec` s/km, Probe jede Sekunde, über `km` Kilometer. */
function steady(km: number, paceSec = 300, hr = 150, alt?: (distKm: number) => number): Sample[] {
  const total = Math.round(km * paceSec)
  const out: Sample[] = []
  for (let t = 0; t <= total; t++) {
    const distKm = t / paceSec
    out.push({ tSec: t, distKm, hr, ...(alt ? { altM: alt(distKm) } : {}) })
  }
  return out
}

describe('elevation', () => {
  it('ignores noise below 3 m', () => {
    const alt = [100, 101, 99.5, 101.5, 100.5, 102, 99.8].map((altM, i) => ({ tSec: i, altM }))
    expect(elevation(alt)).toEqual({ gainM: 0, lossM: 0 })
  })
  it('counts a steady climb and descent', () => {
    const up = Array.from({ length: 11 }, (_, i) => ({ tSec: i, altM: 100 + i * 2 })) // +20
    const down = Array.from({ length: 11 }, (_, i) => ({ tSec: 11 + i, altM: 120 - i * 2 })) // -20
    const r = elevation([...up, ...down])
    expect(r.gainM).toBeGreaterThanOrEqual(18)
    expect(r.gainM).toBeLessThanOrEqual(20)
    expect(r.lossM).toBeGreaterThanOrEqual(17)
    expect(r.lossM).toBeLessThanOrEqual(20)
  })
  it('skips samples without altitude and handles empty input', () => {
    expect(elevation([])).toEqual({ gainM: 0, lossM: 0 })
    expect(elevation([{ tSec: 0 }, { tSec: 1, altM: 10 }, { tSec: 2 }, { tSec: 3, altM: 20 }])).toEqual({ gainM: 10, lossM: 0 })
  })
})

describe('computeSplits', () => {
  it('returns one split per full km for 3 km at 5:00/km', () => {
    const s = computeSplits(steady(3))
    expect(s).toHaveLength(3)
    expect(s.map(x => x.splitIndex)).toEqual([1, 2, 3])
    for (const x of s) {
      expect(x.distanceKm).toBe(1)
      expect(x.durationSec).toBeCloseTo(300, 5)
      expect(x.paceSecPerKm).toBeCloseTo(300, 5)
      expect(x.avgHr).toBe(150)
    }
  })

  it('adds a rest split when >= 0.05 km remain, with its own distance and pace', () => {
    const s = computeSplits(steady(2.5))
    expect(s).toHaveLength(3)
    expect(s[2].distanceKm).toBeCloseTo(0.5, 3)
    expect(s[2].durationSec).toBeCloseTo(150, 3)
    expect(s[2].paceSecPerKm).toBeCloseTo(300, 3)
  })

  it('drops a rest split below 0.05 km', () => {
    expect(computeSplits(steady(2.04))).toHaveLength(2)
    expect(computeSplits(steady(2.06))).toHaveLength(3)
  })

  it('short runs: one split under 1 km, none under 0.05 km', () => {
    const s = computeSplits(steady(0.6))
    expect(s).toHaveLength(1)
    expect(s[0].distanceKm).toBeCloseTo(0.6, 3)
    expect(computeSplits(steady(0.03))).toEqual([])
  })

  it('interpolates the time at the km boundary between samples', () => {
    // 0 s -> 0 km, 10 s -> 0.4 km, 20 s -> 1.2 km, 30 s -> 2.0 km
    const s = computeSplits([
      { tSec: 0, distKm: 0 }, { tSec: 10, distKm: 0.4 }, { tSec: 20, distKm: 1.2 }, { tSec: 30, distKm: 2.0 },
    ])
    expect(s).toHaveLength(2)
    expect(s[0].durationSec).toBeCloseTo(10 + (0.6 / 0.8) * 10, 6) // 17.5
    expect(s[1].durationSec).toBeCloseTo(12.5, 6)
  })

  it('a standing phase (same distance, time passes) counts into the split', () => {
    const s = computeSplits([
      { tSec: 0, distKm: 0 }, { tSec: 100, distKm: 0.5 }, { tSec: 160, distKm: 0.5 }, { tSec: 260, distKm: 1.0 },
    ])
    expect(s).toHaveLength(1)
    expect(s[0].durationSec).toBeCloseTo(260, 6)
  })

  it('computes average HR from the samples inside each split (ignoring missing HR)', () => {
    const samples: Sample[] = []
    for (let t = 0; t <= 600; t++) {
      samples.push({ tSec: t, distKm: t / 300, hr: t < 300 ? 140 : 160 })
    }
    samples[10] = { tSec: 10, distKm: 10 / 300 } // Lücke
    const s = computeSplits(samples)
    expect(s[0].avgHr).toBe(140)
    expect(s[1].avgHr).toBe(160)
  })

  it('computes elevation per split with hysteresis', () => {
    // Km 1: +30 m, Km 2: -10 m
    const s = computeSplits(steady(2, 300, 150, d => d <= 1 ? 100 + 30 * d : 130 - 10 * (d - 1)))
    expect(s[0].elevationGainM).toBeGreaterThan(24)
    expect(s[0].elevationLossM).toBe(0)
    expect(s[1].elevationGainM).toBe(0)
    expect(s[1].elevationLossM).toBeGreaterThan(5)
  })

  it('without distance samples: no splits; with a single sample: no splits', () => {
    expect(computeSplits([{ tSec: 0, hr: 120 }, { tSec: 1, hr: 121 }])).toEqual([])
    expect(computeSplits([{ tSec: 0, distKm: 0 }])).toEqual([])
    expect(computeSplits([])).toEqual([])
  })

  it('ignores samples where distance goes backwards (GPS jump)', () => {
    const s = computeSplits([
      { tSec: 0, distKm: 0 }, { tSec: 150, distKm: 0.5 }, { tSec: 151, distKm: 0.2 }, { tSec: 300, distKm: 1.0 },
    ])
    expect(s).toHaveLength(1)
    expect(s[0].durationSec).toBeCloseTo(300, 6)
  })
})

describe('downsampleStreams', () => {
  it('keeps all points when below the limit and aligns the arrays', () => {
    const r = downsampleStreams(steady(1, 300, 150, () => 200), 500)
    expect(r.t.length).toBe(301)
    for (const k of ['distKm', 'hr', 'paceSec', 'altM'] as const) expect(r[k]).toHaveLength(r.t.length)
    expect(r.hr[5]).toBe(150)
    expect(r.altM[5]).toBe(200)
  })

  it('reduces to at most max points including first and last', () => {
    const r = downsampleStreams(steady(10), 500) // 3001 Punkte
    expect(r.t.length).toBeLessThanOrEqual(500)
    expect(r.t.length).toBeGreaterThan(400)
    expect(r.t[0]).toBe(0)
    expect(r.t[r.t.length - 1]).toBe(3000)
    for (const k of ['distKm', 'hr', 'paceSec', 'altM'] as const) expect(r[k]).toHaveLength(r.t.length)
  })

  it('derives pace over a ~30 s window (s/km)', () => {
    const r = downsampleStreams(steady(2, 300), 500)
    const mid = r.paceSec[Math.floor(r.paceSec.length / 2)] as number
    expect(mid).toBeCloseTo(300, -1)
    expect(r.paceSec[0]).toBeNull() // kein Fenster am Anfang
  })

  it('pace is null while standing still or slower than 20 min/km', () => {
    const samples: Sample[] = []
    for (let t = 0; t <= 120; t++) samples.push({ tSec: t, distKm: t < 60 ? t / 300 : 0.2 }) // ab 60 s Stillstand
    const r = downsampleStreams(samples, 500)
    expect(r.paceSec[100]).toBeNull()
    const slow: Sample[] = []
    for (let t = 0; t <= 120; t++) slow.push({ tSec: t, distKm: t / 1500 }) // 25 min/km
    expect(downsampleStreams(slow, 500).paceSec[100]).toBeNull()
  })

  it('without distance: streams exist for hr/alt, distKm and paceSec are null', () => {
    const r = downsampleStreams([{ tSec: 0, hr: 100, altM: 5 }, { tSec: 5, hr: 110, altM: 6 }], 500)
    expect(r.t).toEqual([0, 5])
    expect(r.hr).toEqual([100, 110])
    expect(r.altM).toEqual([5, 6])
    expect(r.distKm).toEqual([null, null])
    expect(r.paceSec).toEqual([null, null])
  })

  it('empty input gives empty arrays', () => {
    expect(downsampleStreams([], 500)).toEqual({ t: [], distKm: [], hr: [], paceSec: [], altM: [] })
  })
})
