import React, { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme                      // stored preference
  resolvedTheme: 'light' | 'dark'  // what is actually applied
  setTheme: (t: Theme) => void
  toggle: () => void                // cycles light → dark → system → light
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemPref(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) ?? 'system'
  })

  const [systemPref, setSystemPref] = useState<'light' | 'dark'>(getSystemPref)

  // Track OS preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) =>
      setSystemPref(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? systemPref : theme

  // Apply to DOM + persist
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme, resolvedTheme])

  function setTheme(t: Theme) { setThemeState(t) }

  // Cycle: light → dark → system → light
  function toggle() {
    setThemeState(t =>
      t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light'
    )
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
