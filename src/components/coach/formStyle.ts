import type { CSSProperties } from 'react'
import type { FormLevel } from '@/shared/coach'

export const FORM_COLOR: Record<FormLevel, string> = {
  fresh: 'text-emerald-500',
  neutral: 'text-blue-500',
  building: 'text-amber-500',
  overload: 'text-red-500',
}

export const tooltipStyle: CSSProperties = {
  backgroundColor: 'hsl(var(--popover))',
  borderColor: 'hsl(var(--border))',
  borderRadius: '10px',
  fontSize: 12,
  color: 'hsl(var(--popover-foreground))',
  boxShadow: '0 8px 24px -4px rgba(0,0,0,0.15)',
}
