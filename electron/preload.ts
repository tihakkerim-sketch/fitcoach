import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { IpcChannel, IpcResponse } from '../src/types/ipc'

type Listener = (...args: unknown[]) => void
type WrappedListener = (e: IpcRendererEvent, ...args: unknown[]) => void

// Track the wrapper created for each callback so off() can remove the right function
const wrapperMap = new Map<Listener, WrappedListener>()

contextBridge.exposeInMainWorld('fitcoach', {
  invoke: <T>(channel: IpcChannel, payload?: unknown): Promise<IpcResponse<T>> =>
    ipcRenderer.invoke(channel, payload),

  on: (channel: IpcChannel, callback: Listener) => {
    const wrapper: WrappedListener = (_e, ...args) => callback(...args)
    wrapperMap.set(callback, wrapper)
    ipcRenderer.on(channel, wrapper)
  },

  off: (channel: IpcChannel, callback: Listener) => {
    const wrapper = wrapperMap.get(callback)
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper)
      wrapperMap.delete(callback)
    }
  },
})
