/**
 * Core of every IPC handler — free of `electron` imports so it can be unit-tested.
 * `handle.ts` is the thin wrapper that registers this with `ipcMain`.
 */
import type { z } from 'zod'
import type { IpcChannel, IpcResponse } from '../../src/types/ipc'
import { ipcInputs, type ParsedOf, type ResultOf } from '../../src/types/ipcContract'

export type HandlerFn<C extends IpcChannel> = (input: ParsedOf<C>) => ResultOf<C> | Promise<ResultOf<C>>

const MAX_ISSUES_SHOWN = 3

/** Short, readable validation message — no stack traces, no raw payload values. */
export function formatValidationError(error: z.ZodError): string {
  const parts = error.issues.slice(0, MAX_ISSUES_SHOWN).map(issue => {
    const where = issue.path.length ? `${issue.path.join('.')}: ` : ''
    return `${where}${issue.message}`
  })
  const more = error.issues.length > MAX_ISSUES_SHOWN ? ` (+${error.issues.length - MAX_ISSUES_SHOWN} weitere)` : ''
  return `Ungültige Eingabe: ${parts.join('; ')}${more}`
}

export async function runHandler<C extends IpcChannel>(
  channel: C,
  fn: HandlerFn<C>,
  rawInput: unknown,
): Promise<IpcResponse<ResultOf<C>>> {
  const schema: z.ZodType = ipcInputs[channel]
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) {
    return { success: false, error: formatValidationError(parsed.error) }
  }
  try {
    const data = await fn(parsed.data as ParsedOf<C>)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
