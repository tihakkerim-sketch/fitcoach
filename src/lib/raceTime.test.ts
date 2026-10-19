import { describe, it, expect } from 'vitest'
import { formatRaceTime, parseRaceTime } from './raceTime'

describe('parseRaceTime', () => {
  it('mm:ss and h:mm:ss', () => {
    expect(parseRaceTime('25:00')).toBe(1500)
    expect(parseRaceTime(' 1:45:30 ')).toBe(6330)
  })
  it('rejects invalid input', () => {
    for (const s of ['', '25', '25:60', '1:60:00', 'ab:cd', '-5:00']) expect(parseRaceTime(s), s).toBeNull()
  })
})

describe('formatRaceTime', () => {
  it('under one hour as mm:ss, otherwise h:mm:ss', () => {
    expect(formatRaceTime(2999)).toBe('49:59')
    expect(formatRaceTime(6330)).toBe('1:45:30')
  })
})
