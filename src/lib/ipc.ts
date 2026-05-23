import type { IpcChannel, IpcResponse } from '../types/ipc'

// Typed wrapper around the context bridge — use this everywhere in React
export async function invoke<T>(channel: IpcChannel, payload?: unknown): Promise<T> {
  const res: IpcResponse<T> = await window.fitcoach.invoke<T>(channel, payload)
  if (!res.success) throw new Error(res.error)
  return res.data
}

export function on(channel: IpcChannel, callback: (...args: unknown[]) => void) {
  window.fitcoach.on(channel, callback)
}

export function off(channel: IpcChannel, callback: (...args: unknown[]) => void) {
  window.fitcoach.off(channel, callback)
}
