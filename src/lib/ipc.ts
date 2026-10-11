import type { IpcChannel, IpcResponse } from '../types/ipc'
import type { InputOf, ResultOf } from '../types/ipcContract'

// Typed wrapper around the context bridge — use this everywhere in React.
// Argument and result types come from the IPC contract (src/types/ipcContract.ts).
export async function invoke<C extends IpcChannel>(
  channel: C,
  ...args: undefined extends InputOf<C> ? [payload?: InputOf<C>] : [payload: InputOf<C>]
): Promise<ResultOf<C>> {
  const res: IpcResponse<ResultOf<C>> = await window.fitcoach.invoke<ResultOf<C>>(channel, args[0])
  if (!res.success) throw new Error(res.error)
  return res.data
}

export function on(channel: IpcChannel, callback: (...args: unknown[]) => void) {
  window.fitcoach.on(channel, callback)
}

export function off(channel: IpcChannel, callback: (...args: unknown[]) => void) {
  window.fitcoach.off(channel, callback)
}
