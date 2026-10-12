/**
 * „Heute" im Renderer mit einstellbarem Tageswechsel (Profil `dayStartHour`, Standard 4).
 * Statt `todayLocal()` überall `today()` benutzen. Stunde beim Start und nach dem Speichern laden.
 */
import { IPC } from '@/types/ipc'
import { todayLocal } from '@/shared/planCalendar'
import { invoke } from './ipc'

let dayStartHour = 4

export function today(): string {
  return todayLocal(new Date(), dayStartHour)
}

export function setDayStartHour(h: number): void {
  dayStartHour = h
}

export async function loadDayStartHour(): Promise<void> {
  try {
    const profile = await invoke(IPC.PROFILE_GET)
    dayStartHour = profile?.dayStartHour ?? 4
  } catch {
    dayStartHour = 4
  }
}
