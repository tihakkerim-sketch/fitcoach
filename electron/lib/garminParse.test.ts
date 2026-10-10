// Must run before any Date is created so Node picks up the zone.
process.env.TZ = 'Europe/Vienna'

import { describe, it, expect } from 'vitest'
import { toLocalDateTime, parseTcxFile } from './garminParse'

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
    const r = await parseTcxFile(Buffer.from(TCX, 'utf-8'))
    expect(r.type).toBe('running')
    expect(r.date).toBe('2026-06-11')
    expect(r.startTime).toBe('00:30')
    expect(r.durationMin).toBe(45)       // (1800 + 900) s
    expect(r.distanceKm).toBe(7.5)       // 7500 m
    expect(r.avgHr).toBe(147)            // (140*1800 + 160*900) / 2700 = 146.67
    expect(r.maxHr).toBe(175)
    expect(r.source).toBe('garmin_import')
  })
})
