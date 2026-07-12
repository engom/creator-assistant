import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Activity, Play, Settings, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { HealthBadge } from './HealthBadge'

const NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Feed' },
  { to: '/analyze',  icon: Play,            label: 'Analyze' },
  { to: '/activity', icon: Activity,        label: 'Activity' },
  { to: '/settings', icon: Settings,        label: 'Settings' },
]

export function AppShell() {
  return (
    <div className="min-h-svh flex flex-col bg-surface-dark">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-surface-dark/90 backdrop-blur-md border-b border-surface-dark-border safe-top">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-semibold text-gray-100 text-sm tracking-tight">Omicron</span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-0.5 flex-1">
            {NAV.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-white/10 text-gray-100'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5',
                )}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <HealthBadge />
            <NotificationBell />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 safe-bottom">
        <Outlet />
      </main>
    </div>
  )
}
