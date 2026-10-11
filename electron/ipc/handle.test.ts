import { describe, it, expect, vi } from 'vitest'
import { IPC } from '../../src/types/ipc'
import { runHandler } from './runHandler'

describe('runHandler', () => {
  it('valid input: calls fn with parsed data and wraps the result', async () => {
    const fn = vi.fn((id: number) => ({ id }) as never)
    const res = await runHandler(IPC.ACTIVITIES_GET, fn as never, 5)
    expect(fn).toHaveBeenCalledWith(5)
    expect(res).toEqual({ success: true, data: { id: 5 } })
  })

  it('invalid input: success=false, fn is never called, message is short and readable', async () => {
    const fn = vi.fn()
    const res = await runHandler(IPC.ACTIVITIES_GET, fn as never, 'abc')
    expect(fn).not.toHaveBeenCalled()
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/^Ungültige Eingabe: /)
      expect(res.error).not.toMatch(/\n\s+at /) // no stack trace
    }
  })

  it('rejects missing payload for channels that need one', async () => {
    const fn = vi.fn()
    const res = await runHandler(IPC.RECOVERY_LOGS_GET, fn as never, undefined)
    expect(res.success).toBe(false)
    expect(fn).not.toHaveBeenCalled()
  })

  it('channels without input accept undefined and reject anything else', async () => {
    const fn = vi.fn(() => [] as never)
    expect(await runHandler(IPC.PLANS_LIST, fn as never, undefined)).toEqual({ success: true, data: [] })
    const bad = await runHandler(IPC.PLANS_LIST, fn as never, { evil: true })
    expect(bad.success).toBe(false)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('strips unknown keys before they reach fn', async () => {
    const fn = vi.fn(() => undefined as never)
    await runHandler(IPC.SESSIONS_LINK_ACTIVITY, fn as never, { sessionId: 1, activityId: null, extra: 'x' })
    expect(fn).toHaveBeenCalledWith({ sessionId: 1, activityId: null })
  })

  it('fn throws: success=false with the error message', async () => {
    const fn = vi.fn(() => { throw new Error('db kaputt') })
    const res = await runHandler(IPC.ACTIVITIES_DELETE, fn as never, 1)
    expect(res).toEqual({ success: false, error: 'db kaputt' })
  })

  it('async fn rejects: success=false', async () => {
    const fn = vi.fn(async () => { throw new Error('nope') })
    const res = await runHandler(IPC.ACTIVITIES_DELETE, fn as never, 1)
    expect(res).toEqual({ success: false, error: 'nope' })
  })
})
