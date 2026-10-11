import { ipcMain } from 'electron'
import type { IpcChannel } from '../../src/types/ipc'
import { runHandler, type HandlerFn } from './runHandler'

/**
 * Registers an IPC handler: the payload is validated against the schema from the
 * IPC contract (src/types/ipcContract.ts) before `fn` runs, and the result or any
 * thrown error is wrapped into an `IpcResponse`. `fn` must return the contract's result type.
 */
export function handle<C extends IpcChannel>(channel: C, fn: HandlerFn<C>): void {
  ipcMain.handle(channel, (_event, rawInput: unknown) => runHandler(channel, fn, rawInput))
}
