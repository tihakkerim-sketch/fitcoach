// Must run before any Date is created so Node picks up the zone.
process.env.TZ = 'Europe/Vienna'

import { describe, it, expect } from 'vitest'
import { toLocalDateTime, parseTcxFile, fitDataToParsed, parseGarminFile } from './garminParse'

const TCX = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>2026-06-10T22:30:00Z</Id>
      <Lap StartTime="2026-06-10T22:30:00Z">
        <TotalTimeSeconds>1800</TotalTimeSeconds>
        <DistanceMeters>5000</DistanceMeters>
        <AverageHeartRateBpm><Value>140</Value></AverageHeartRateBpm>
        <MaximumHeartRateBpm><Value>160</Value></MaximumHeartRateBpm>
      </Lap>
      <Lap StartTime="2026-06-10T23:00:00Z">
        <TotalTimeSeconds>900</TotalTimeSeconds>
        <DistanceMeters>2500</DistanceMeters>
        <AverageHeartRateBpm><Value>160</Value></AverageHeartRateBpm>
        <MaximumHeartRateBpm><Value>175</Value></MaximumHeartRateBpm>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`

describe('timezone setup', () => {
  it('Node honours TZ=Europe/Vienna', () => {
    // 22:30Z in June (CEST, UTC+2) is 00:30 the next day locally
    expect(new Date('2026-06-10T22:30:00Z').getHours()).toBe(0)
    expect(new Date('2026-06-10T22:30:00Z').getTimezoneOffset()).toBe(-120)
  })
})

describe('toLocalDateTime', () => {
  it('uses the local date, not the UTC date', () => {
    expect(toLocalDateTime('2026-06-10T22:30:00Z')).toEqual({ date: '2026-06-11', startTime: '00:30' })
  })

  it('accepts a Date object', () => {
    expect(toLocalDateTime(new Date('2026-12-31T23:15:00Z'))).toEqual({ date: '2027-01-01', startTime: '00:15' })
  })
})

describe('parseTcxFile', () => {
  it('parses a two-lap run with local date and weighted HR', async () => {
    const { activity: r, samples } = await parseTcxFile(Buffer.from(TCX, 'utf-8'))
    expect(r.type).toBe('running')
    expect(r.date).toBe('2026-06-11')
    expect(r.startTime).toBe('00:30')
    expect(r.durationMin).toBe(45)       // (1800 + 900) s
    expect(r.distanceKm).toBe(7.5)       // 7500 m
    expect(r.avgHr).toBe(147)            // (140*1800 + 160*900) / 2700 = 146.67
    expect(r.maxHr).toBe(175)
    expect(r.source).toBe('garmin_import')
    expect(samples).toEqual([])          // keine Trackpoints
  })

  const tp = (time: string, dist: number, hr: number, alt: number) =>
    `<Trackpoint><Time>${time}</Time><AltitudeMeters>${alt}</AltitudeMeters><DistanceMeters>${dist}</DistanceMeters>` +
    `<HeartRateBpm><Value>${hr}</Value></HeartRateBpm></Trackpoint>`
  const wrap = (laps: string) => `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities>
    <Activity Sport="Running"><Id>2026-06-10T08:00:00Z</Id>${laps}</Activity></Activities></TrainingCenterDatabase>`

  it('reads trackpoints over all laps into samples (time from start, km, hr, altitude)', async () => {
    const xml = wrap(
      `<Lap StartTime="2026-06-10T08:00:00Z"><TotalTimeSeconds>20</TotalTimeSeconds><DistanceMeters>60</DistanceMeters><Track>` +
      tp('2026-06-10T08:00:00Z', 0, 120, 200) + tp('2026-06-10T08:00:10Z', 30, 130, 205) + `</Track></Lap>` +
      `<Lap StartTime="2026-06-10T08:00:20Z"><TotalTimeSeconds>20</TotalTimeSeconds><DistanceMeters>60</DistanceMeters><Track>` +
      tp('2026-06-10T08:00:20Z', 60, 140, 210) + tp('2026-06-10T08:00:30Z', 90, 150, 202) + `</Track></Lap>`)
    const { activity, samples } = await parseTcxFile(Buffer.from(xml))
    expect(samples).toEqual([
      { tSec: 0, distKm: 0, hr: 120, altM: 200 },
      { tSec: 10, distKm: 0.03, hr: 130, altM: 205 },
      { tSec: 20, distKm: 0.06, hr: 140, altM: 210 },
      { tSec: 30, distKm: 0.09, hr: 150, altM: 202 },
    ])
    expect(activity.elevationGainM).toBe(10)
    expect(activity.elevationLossM).toBe(8)
    // kompakt: keine Samples im Rohdatenfeld
    expect(JSON.stringify(activity.rawGarminData)).not.toContain('"hr"')
  })

  it('handles a single lap with a single trackpoint (fast-xml-parser gives objects, not arrays)', async () => {
    const xml = wrap(`<Lap StartTime="2026-06-10T08:00:00Z"><TotalTimeSeconds>5</TotalTimeSeconds><DistanceMeters>10</DistanceMeters><Track>` +
      tp('2026-06-10T08:00:00Z', 10, 120, 200) + `</Track></Lap>`)
    const { samples } = await parseTcxFile(Buffer.from(xml))
    expect(samples).toEqual([{ tSec: 0, distKm: 0.01, hr: 120, altM: 200 }])
  })

  it('handles several Track elements in one lap (pauses) and trackpoints without HR/altitude', async () => {
    const xml = wrap(`<Lap StartTime="2026-06-10T08:00:00Z"><TotalTimeSeconds>30</TotalTimeSeconds><DistanceMeters>100</DistanceMeters>` +
      `<Track>${tp('2026-06-10T08:00:00Z', 0, 120, 200)}</Track>` +
      `<Track><Trackpoint><Time>2026-06-10T08:00:20Z</Time><DistanceMeters>50</DistanceMeters></Trackpoint></Track></Lap>`)
    const { samples } = await parseTcxFile(Buffer.from(xml))
    expect(samples).toEqual([{ tSec: 0, distKm: 0, hr: 120, altM: 200 }, { tSec: 20, distKm: 0.05 }])
  })

  it('continues the distance when a later lap restarts at 0 m', async () => {
    const xml = wrap(
      `<Lap StartTime="2026-06-10T08:00:00Z"><TotalTimeSeconds>10</TotalTimeSeconds><DistanceMeters>100</DistanceMeters><Track>` +
      tp('2026-06-10T08:00:00Z', 0, 120, 200) + tp('2026-06-10T08:00:10Z', 100, 130, 200) + `</Track></Lap>` +
      `<Lap StartTime="2026-06-10T08:00:10Z"><TotalTimeSeconds>10</TotalTimeSeconds><DistanceMeters>100</DistanceMeters><Track>` +
      tp('2026-06-10T08:00:11Z', 0, 140, 200) + tp('2026-06-10T08:00:20Z', 90, 150, 200) + `</Track></Lap>`)
    const { samples } = await parseTcxFile(Buffer.from(xml))
    expect(samples.map(s => s.distKm)).toEqual([0, 0.1, 0.1, 0.19])
  })

  it('rejects files that are not TCX', async () => {
    await expect(parseTcxFile(Buffer.from('<foo/>'))).rejects.toThrow(/TCX/)
  })
})

describe('fitDataToParsed', () => {
  // fit-file-parser mit lengthUnit 'km': distance UND altitude/total_ascent sind in km
  const data = {
    sessions: [{
      sport: 'running', start_time: new Date('2026-06-10T22:30:00Z'), total_elapsed_time: 1830, total_timer_time: 1800,
      total_distance: 5, avg_heart_rate: 150, max_heart_rate: 170, avg_cadence: 82,
      total_ascent: 0.025, total_descent: 0.02,
    }],
    records: [
      { timestamp: new Date('2026-06-10T22:30:00Z'), distance: 0, heart_rate: 120, enhanced_altitude: 0.2 },
      { timestamp: new Date('2026-06-10T22:30:10Z'), distance: 0.03, heart_rate: 130, altitude: 0.203 },
      { timestamp: new Date('2026-06-10T22:30:20Z'), distance: 0.06 },
    ],
  }

  it('maps session summary, local date, moving time and elevation (km -> m)', () => {
    const { activity: a } = fitDataToParsed(data)
    expect(a).toMatchObject({
      type: 'running', date: '2026-06-11', startTime: '00:30', source: 'garmin_import',
      durationMin: 31, movingTimeMin: 30, distanceKm: 5, avgHr: 150, maxHr: 170, avgCadence: 82,
    })
    expect(a.elevationGainM).toBeCloseTo(25, 6)
    expect(a.elevationLossM).toBeCloseTo(20, 6)
  })

  it('maps records to samples with altitude in metres (enhanced_altitude preferred)', () => {
    const { samples } = fitDataToParsed(data)
    expect(samples).toHaveLength(3)
    expect(samples[0]).toEqual({ tSec: 0, distKm: 0, hr: 120, altM: 200 })
    expect(samples[1].tSec).toBe(10)
    expect(samples[1].altM).toBeCloseTo(203, 6)
    expect(samples[2]).toEqual({ tSec: 20, distKm: 0.06 })
  })

  it('can read altitude already in metres via option', () => {
    const { samples } = fitDataToParsed(
      { records: [{ timestamp: new Date('2026-06-10T10:00:00Z'), altitude: 200 }] }, { altitudeUnit: 'm' })
    expect(samples[0].altM).toBe(200)
  })

  it('falls back to elevation from samples when the session has no ascent/descent', () => {
    const records = [0, 5, 10].map((alt, i) => ({ timestamp: new Date(2026, 5, 10, 10, 0, i * 10), distance: i * 0.03, altitude: (200 + alt) / 1000 }))
    const { activity } = fitDataToParsed({ sessions: [{ sport: 'running', start_time: records[0].timestamp }], records })
    expect(activity.elevationGainM).toBeCloseTo(10, 6)
    expect(activity.elevationLossM).toBe(0)
  })

  it('keeps rawGarminData compact (no records/laps) and survives data without records', () => {
    const { activity, samples } = fitDataToParsed({ ...data, laps: [{ a: 1 }] })
    const json = JSON.stringify(activity.rawGarminData)
    expect(json).not.toContain('"heart_rate"')
    expect(json).not.toContain('timestamp')
    expect(activity.rawGarminData).toMatchObject({ format: 'fit', sport: 'running', recordCount: 3 })
    expect(json.length).toBeLessThan(2000)
    expect(fitDataToParsed({ sessions: [{ sport: 'cycling', start_time: new Date('2026-06-10T10:00:00Z') }] }).samples).toEqual([])
    expect(samples.length).toBe(3)
  })

  it('maps sports: running, cycling, other -> custom', () => {
    const t = (sport: string) => fitDataToParsed({ sessions: [{ sport, start_time: new Date() }] }).activity.type
    expect(t('running')).toBe('running')
    expect(t('cycling')).toBe('cycling')
    expect(t('swimming')).toBe('custom')
  })
})

describe('parseGarminFile', () => {
  it('dispatches by extension (case-insensitive) and rejects others', async () => {
    const r = await parseGarminFile('LAUF.TCX', Buffer.from(TCX))
    expect(r.activity.type).toBe('running')
    await expect(parseGarminFile('x.gpx', Buffer.from(''))).rejects.toThrow()
  })
})
