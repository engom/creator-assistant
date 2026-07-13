import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAppStore, store } from '@/store/app'
import { NotificationCard } from './NotificationCard'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const notifications = useAppStore((s) => s.notifications)
  const unread = notifications.filter((n) => !n.read).length

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative grid h-11 w-11 place-items-center rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-95',
          open ? 'bg-white/10 text-gray-100' : 'text-gray-400 hover:bg-white/8 hover:text-gray-200',
        )}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center animate-pulse-ring">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-12 z-50 max-h-[min(600px,calc(100svh-6rem))] w-[min(420px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-surface-dark-border bg-surface-dark shadow-notification"
          >
            {/* Header */}
            <div className="sticky top-0 bg-surface-dark/95 backdrop-blur-sm px-4 py-3 border-b border-surface-dark-border flex items-center justify-between z-10">
              <div>
                <h3 className="text-sm font-semibold text-gray-100">Alerts</h3>
                {unread > 0 && (
                  <p className="text-xs text-gray-500">{unread} unread</p>
                )}
              </div>
              {unread > 0 && (
                <button
                  onClick={() => store.markAllRead()}
                  className="-mr-2 min-h-11 rounded-xl px-3 text-xs font-medium text-brand-400 transition-colors hover:bg-brand-500/10 hover:text-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="p-2 flex flex-col gap-1.5">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm">
                  No alerts yet
                </div>
              ) : (
                notifications.map((n) => (
                  <NotificationCard
                    key={n.id}
                    notification={n}
                    onClick={() => setOpen(false)}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
