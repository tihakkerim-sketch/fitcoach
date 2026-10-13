import { describe, it, expect } from 'vitest'
import { initialUpdateStatus, reduceUpdateStatus, updateErrorMessage, disabledUpdateStatus } from './updateStatus'

describe('reduceUpdateStatus', () => {
  it('checking -> available -> downloading -> downloaded', () => {
    let s = reduceUpdateStatus(initialUpdateStatus, { type: 'checking' })
    expect(s).toEqual({ state: 'checking' })
    s = reduceUpdateStatus(s, { type: 'available', version: '1.1.0' })
    expect(s).toEqual({ state: 'available', version: '1.1.0' })
    s = reduceUpdateStatus(s, { type: 'progress', percent: 42.6 })
    expect(s).toEqual({ state: 'downloading', version: '1.1.0', percent: 43 })
    s = reduceUpdateStatus(s, { type: 'downloaded', version: '1.1.0' })
    expect(s).toEqual({ state: 'downloaded', version: '1.1.0' })
  })

  it('begrenzt Prozent auf 0..100', () => {
    expect(reduceUpdateStatus(initialUpdateStatus, { type: 'progress', percent: 150 }).percent).toBe(100)
    expect(reduceUpdateStatus(initialUpdateStatus, { type: 'progress', percent: -5 }).percent).toBe(0)
  })

  it('not-available', () => {
    expect(reduceUpdateStatus({ state: 'checking' }, { type: 'not-available' })).toEqual({ state: 'not-available' })
  })

  it('geladenes Update wird von einer neuen Prüfung nicht überschrieben', () => {
    const done = { state: 'downloaded' as const, version: '1.1.0' }
    expect(reduceUpdateStatus(done, { type: 'checking' })).toBe(done)
  })

  it('Fehler bekommt deutsche Meldung', () => {
    const s = reduceUpdateStatus({ state: 'checking' }, { type: 'error', error: new Error('getaddrinfo ENOTFOUND github.com') })
    expect(s.state).toBe('error')
    expect(s.message).toContain('Internetverbindung')
  })
})

describe('updateErrorMessage', () => {
  it('erkennt fehlende Veröffentlichung', () => {
    expect(updateErrorMessage(new Error('Cannot find latest.yml (404)'))).toContain('noch keine')
  })
  it('Fallback', () => {
    expect(updateErrorMessage('komisch')).toBe('Update-Prüfung fehlgeschlagen.')
  })
  it('disabled-Status', () => {
    expect(disabledUpdateStatus.message).toBe('Updates nur in der installierten App')
  })
})
