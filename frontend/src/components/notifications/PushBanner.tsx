import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { X, TrendingUp, TrendingDown, AlertTriangle, Check } from 'lucide-react'
import { cn, urgencyColor, platformIcon } from '@/lib/utils'
import type { Notification } from '@/api/types'
import { store } from '@/store/app'
import { useAppStore } from '@/store/app'

// Monitors the notification list and pops new, unread high/medium urgency alerts as push banners

let lastNotifCount = 0

export function PushBanner() {
  const notifications = useAppStore((s) => s.notifications)
  const [banner, setBanner] = useState<Notification | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const current = notifications.filter((n) => !n.read && n.urgency !== 'low')
    if (current.length > lastNotifCount) {
      const newest = current[0]
      lastNotifCount = current.length
      if (newest) {
        clearTimeout(timerRef.current)
        setBanner(newest)
        timerRef.current = setTimeout(() => setBanner(null), 8000)
      }
    } else {
      lastNotifCount = current.length
    }
  }, [notifications])

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  function dismiss() {
    clearTimeout(timerRef.current)
    setBanner(null)
  }

  function handleAction(n: Notification) {
    store.approveAction(n.id)
    dismiss()
  }

  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          initial={{ opacity: 0, y: -80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          className={cn(
            'fixed top-4 left-1/2 -translate-x-1/2 z-[9998]',
            'w-[min(420px,calc(100vw-2rem))]',
            'bg-surface-dark-muted/95 backdrop-blur-xl',
            'border rounded-2xl shadow-notification',
            banner.urgency === 'high' ? 'border-red-500/40' : 'border-amber-500/35',
          )}
          onClick={() => store.markRead(banner.id)}
        >
          {/* Top accent line */}
          <div className={cn(
            'h-0.5 rounded-t-2xl',
            banner.urgency === 'high' ? 'bg-red-500' : 'bg-amber-500'
          )} />

          <div className="p-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                banner.urgency === 'high' ? 'bg-red-500/20' : 'bg-amber-500/20',
              )}>
                {banner.signal === 'above_baseline'
                  ? <TrendingUp size={18} className="text-green-400" />
                  : banner.signal === 'below_baseline'
                  ? <TrendingDown size={18} className="text-red-400" />
                  : <AlertTriangle size={18} className="text-amber-400" />
                }
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{platformIcon(banner.platform)}</span>
                  <span className="text-xs font-semibold text-gray-300">
                    {banner.creator_id.replace('creator_', '@')}
                  </span>
                  <span className={cn('text-xs font-semibold ml-auto', urgencyColor(banner.urgency))}>
                    {banner.urgency.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-gray-200 leading-snug">{banner.insight}</p>
              </div>

              <button onClick={dismiss} className="text-gray-600 hover:text-gray-300 transition-colors shrink-0">
                <X size={14} />
              </button>
            </div>

            {/* Recommended action + CTA */}
            {banner.recommended_action && (
              <div className="mt-3 pt-3 border-t border-white/5 flex items-start gap-2">
                <p className="text-xs text-gray-400 flex-1 leading-relaxed">
                  {banner.recommended_action}
                </p>
                {!banner.approved && (
                  <button
                    onClick={() => handleAction(banner)}
                    className={cn(
                      'shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                      banner.urgency === 'high'
                        ? 'bg-brand-500 hover:bg-brand-600 text-white'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30',
                    )}
                  >
                    <Check size={11} />
                    Approve
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
