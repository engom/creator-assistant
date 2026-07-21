import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Activity, BarChart2, Settings, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { HealthBadge } from './HealthBadge'

const NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Pulse' },
  { to: '/analyze',  icon: BarChart2,        label: 'Insights' },
  { to: '/activity', icon: Activity,        label: 'Alerts' },
  { to: '/settings', icon: Settings,        label: 'Settings' },
]

export function AppShell() {
  return (
    <div className="min-h-svh flex flex-col" style={{ background: '#07090e' }}>
      {/* Top bar */}
      <header
        className="sticky top-0 z-40 backdrop-blur-xl border-b border-surface-dark-border safe-top"
        style={{ background: 'rgba(7,9,14,0.92)' }}
      >
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center shadow-brand-glow"
              style={{ background: '#7c6fff' }}
            >
              <Zap size={13} className="text-white" />
            </div>
            <span className="font-semibold text-gray-100 text-sm tracking-tight">PubIQ</span>
          </div>

          {/* Desktop nav — hidden on mobile */}
          <nav className="hidden sm:flex items-center gap-0.5 flex-1 ml-4">
            {NAV.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-brand-500/12 text-brand-300'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5',
                )}
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 ml-auto">
            <HealthBadge />
            <NotificationBell />
          </div>
        </div>
      </header>

      {/* Main content — bottom padding must exceed nav height + system bar */}
      <main
        className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 sm:pb-6"
        style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Outlet />
      </main>

      {/* Scrim above bottom nav — mobile only */}
      <div
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 pointer-events-none"
        style={{
          height: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
          background: 'linear-gradient(to top, #07090e 0%, rgba(7,9,14,0.7) 40%, transparent 100%)',
        }}
      />

      {/* Bottom nav — mobile only */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 px-3"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div
          className="flex items-stretch h-[60px] rounded-2xl border border-surface-dark-border overflow-hidden"
          style={{
            background: 'rgba(15,20,32,0.97)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 -1px 0 rgba(255,255,255,0.04), 0 -12px 40px rgba(0,0,0,0.7)',
          }}
        >
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className="flex-1"
            >
              {({ isActive }) => (
                <div
                  className={cn(
                    'flex flex-col items-center justify-center h-full gap-1 mx-0.5 my-1 rounded-xl transition-all duration-150',
                    isActive ? 'bg-brand-500/12' : 'hover:bg-white/4',
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2 : 1.5}
                    className={isActive ? 'text-brand-400' : 'text-gray-600'}
                  />
                  <span
                    className={cn(
                      'text-[10px] font-medium leading-none',
                      isActive ? 'text-brand-400' : 'text-gray-600',
                    )}
                  >
                    {label}
                  </span>
                </div>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
