import { useEffect, useState, type ElementType } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Activity, LayoutDashboard, CalendarDays, FileDown,
  TrendingUp, Settings, Moon, Sun, Monitor, Zap, Scale, Utensils, BatteryCharging, Swords,
} from 'lucide-react'
import { LogActivityModal } from '@/components/activities/LogActivityModal'
import { useTheme } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'

type NavColor = 'blue' | 'green' | 'purple' | 'orange' | 'slate'
type NavItem  = { to: string; label: string; Icon: ElementType; color: NavColor }
type NavGroup = { heading: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { to: '/',        label: 'Dashboard',  Icon: LayoutDashboard, color: 'blue'   },
    ],
  },
  {
    heading: 'Performance',
    items: [
      { to: '/habits',     label: 'Habits',     Icon: Zap,      color: 'orange' },
      { to: '/checkin',   label: 'Check-in',  Icon: Sun,      color: 'orange' },
      { to: '/challenges', label: 'Challenges', Icon: Swords,   color: 'orange' },
      { to: '/nutrition', label: 'Nutrition', Icon: Utensils,        color: 'green'  },
      { to: '/recovery',  label: 'Recovery',  Icon: BatteryCharging, color: 'purple' },
      { to: '/body',      label: 'Body',      Icon: Scale,           color: 'green'  },
    ],
  },
  {
    heading: 'Training',
    items: [
      { to: '/activities', label: 'Activities', Icon: Activity,     color: 'green'  },
      { to: '/plan',       label: 'Plans',      Icon: CalendarDays, color: 'purple' },
      { to: '/progress',   label: 'Progress',   Icon: TrendingUp,   color: 'orange' },
    ],
  },
  {
    heading: 'App',
    items: [
      { to: '/export',   label: 'Export',   Icon: FileDown, color: 'blue'  },
      { to: '/settings', label: 'Settings', Icon: Settings, color: 'slate' },
    ],
  },
]

const ACTIVE_STYLES: Record<NavColor, string> = {
  blue:   'bg-blue-500/10   text-blue-500   dark:bg-blue-500/10   dark:text-blue-400',
  green:  'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  purple: 'bg-violet-500/10 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
  orange: 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  slate:  'bg-slate-500/10  text-slate-600  dark:bg-slate-500/10  dark:text-slate-400',
}

const HOVER_STYLES: Record<NavColor, string> = {
  blue:   'hover:bg-blue-500/5   hover:text-blue-500',
  green:  'hover:bg-emerald-500/5 hover:text-emerald-600',
  purple: 'hover:bg-violet-500/5 hover:text-violet-600',
  orange: 'hover:bg-orange-500/5 hover:text-orange-600',
  slate:  'hover:bg-slate-500/5  hover:text-slate-600',
}

const INDICATOR_STYLES: Record<NavColor, string> = {
  blue:   'bg-blue-500',
  green:  'bg-emerald-500',
  purple: 'bg-violet-500',
  orange: 'bg-orange-500',
  slate:  'bg-slate-400',
}

// What the toggle button shows (describes what clicking WILL switch to)
const TOGGLE_NEXT = {
  light:  { Icon: Moon,    label: 'Dark mode'  },
  dark:   { Icon: Monitor, label: 'Auto'       },
  system: { Icon: Sun,     label: 'Light mode' },
} as const

export function Layout() {
  const { theme, toggle } = useTheme()
  const [quickLogOpen, setQuickLogOpen] = useState(false)

  // Global keyboard shortcut: N → open log activity modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' ||
        (e.target as HTMLElement).isContentEditable
      if (isEditable) return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setQuickLogOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const { Icon: ToggleIcon, label: toggleLabel } = TOGGLE_NEXT[theme]

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-card">

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <p className="font-bold text-base tracking-tight">FitCoach</p>
            <p className="text-[10px] text-muted-foreground">Desktop</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {navGroups.map(({ heading, items }) => (
            <div key={heading}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                {heading}
              </p>
              <div className="space-y-0.5">
                {items.map(({ to, label, Icon, color }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                        isActive
                          ? ACTIVE_STYLES[color]
                          : cn('text-muted-foreground', HOVER_STYLES[color])
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            className={cn(
                              'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full',
                              INDICATOR_STYLES[color]
                            )}
                          />
                        )}
                        <Icon className="h-4 w-4 shrink-0" />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Shortcut hint */}
        <div className="px-4 pb-2">
          <p className="text-[10px] text-muted-foreground/50 text-center">
            Press <kbd className="font-mono">N</kbd> to log activity
          </p>
        </div>

        {/* Theme toggle */}
        <div className="px-3 py-3 border-t border-border">
          <button
            onClick={toggle}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150"
          >
            <ToggleIcon className="h-4 w-4 shrink-0" />
            {toggleLabel}
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Global log modal (triggered by N shortcut) */}
      <LogActivityModal
        open={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSaved={() => setQuickLogOpen(false)}
      />
    </div>
  )
}
