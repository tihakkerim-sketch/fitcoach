import { describe, it, expect } from 'vitest'
import {
  todayLocal, isMonday, mondayOf, addDaysStr, sessionDate, weekRange, planEndDate,
  currentWeekIndex, planState, isMissed, formatPace, parsePace, parsePaceRange,
} from './planCalendar'

describe('planCalendar', () => {
  it('todayLocal nutzt lokales Datum', () => {
    expect(todayLocal(new Date(2026, 9, 11, 23, 59))).toBe('2026-10-11')
    expect(todayLocal(new Date(2026, 9, 12, 0, 1))).toBe('2026-10-12')
  })

  it('sessionDate', () => {
    expect(sessionDate('2026-05-18', 0, 2)).toBe('2026-05-19')
    expect(sessionDate('2026-05-18', 12, 7)).toBe('2026-08-16')
  })

  it('sessionDate verrutscht nicht bei Sommerzeit-Wechsel', () => {
    expect(sessionDate('2026-10-19', 0, 7)).toBe('2026-10-25')
    expect(sessionDate('2026-10-19', 1, 1)).toBe('2026-10-26')
    expect(sessionDate('2027-03-22', 1, 1)).toBe('2027-03-29')
    expect(sessionDate('2027-03-22', 0, 7)).toBe('2027-03-28')
  })

  it('addDaysStr über Jahreswechsel', () => {
    expect(addDaysStr('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysStr('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('mondayOf / isMonday', () => {
    expect(mondayOf('2026-10-11')).toBe('2026-10-05') // Sonntag
    expect(mondayOf('2026-10-12')).toBe('2026-10-12') // Montag
    expect(mondayOf('2026-10-14')).toBe('2026-10-12')
    expect(isMonday('2026-05-18')).toBe(true)
    expect(isMonday('2026-05-19')).toBe(false)
  })

  it('weekRange und planEndDate', () => {
    expect(weekRange('2026-05-18', 1)).toEqual({ from: '2026-05-25', to: '2026-05-31' })
    expect(planEndDate('2026-05-18', 13)).toBe('2026-08-16')
  })

  it('planState', () => {
    expect(planState('2026-05-18', 13, '2026-10-11')).toBe('finished')
    expect(planState('2026-05-18', 13, '2026-05-17')).toBe('before')
    expect(planState('2026-05-18', 13, '2026-05-18')).toBe('running')
    expect(planState('2026-05-18', 13, '2026-08-16')).toBe('running')
    expect(planState('2026-05-18', 13, '2026-08-17')).toBe('finished')
  })

  it('currentWeekIndex', () => {
    expect(currentWeekIndex('2026-05-18', '2026-05-25')).toBe(1)
    expect(currentWeekIndex('2026-05-18', '2026-05-24')).toBe(0)
    expect(currentWeekIndex('2026-05-18', '2026-05-17')).toBe(-1)
    expect(currentWeekIndex('2026-10-19', '2026-10-26')).toBe(1) // über Sommerzeit-Ende
  })

  it('isMissed', () => {
    expect(isMissed({ status: 'planned', type: 'running' }, '2026-10-10', '2026-10-11')).toBe(true)
    expect(isMissed({ status: 'planned', type: 'running' }, '2026-10-11', '2026-10-11')).toBe(false)
    expect(isMissed({ status: 'planned', type: 'rest' }, '2026-10-10', '2026-10-11')).toBe(false)
    expect(isMissed({ status: 'completed', type: 'running' }, '2026-10-10', '2026-10-11')).toBe(false)
    expect(isMissed({ status: 'skipped', type: 'running' }, '2026-10-10', '2026-10-11')).toBe(false)
  })

  it('Pace-Format', () => {
    expect(formatPace(330)).toBe('5:30')
    expect(formatPace(365)).toBe('6:05')
    expect(parsePace('5:30')).toBe(330)
    expect(parsePace('5:75')).toBeNull()
    expect(parsePace('abc')).toBeNull()
    expect(parsePaceRange('5:30-5:50')).toEqual({ fast: 330, slow: 350 })
    expect(parsePaceRange('5:30–5:50')).toEqual({ fast: 330, slow: 350 })
    expect(parsePaceRange('5:50-5:30')).toEqual({ fast: 330, slow: 350 })
    expect(parsePaceRange('5:30')).toEqual({ fast: 330, slow: 330 })
    expect(parsePaceRange('5:30-abc')).toBeNull()
    expect(parsePaceRange('')).toBeNull()
  })
})
