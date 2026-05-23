import type { IpcChannel, IpcResponse } from './ipc'

declare global {
  interface Window {
    fitcoach: {
      invoke: <T>(channel: IpcChannel, payload?: unknown) => Promise<IpcResponse<T>>
      on: (channel: IpcChannel, callback: (...args: unknown[]) => void) => void
      off: (channel: IpcChannel, callback: (...args: unknown[]) => void) => void
    }
  }
}

export {}
