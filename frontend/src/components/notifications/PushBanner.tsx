import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, TrendingUp, TrendingDown, AlertTriangle, Check, Zap } from 'lucide-react'
import { cn, platformIcon } from '@/lib/utils'
import type { Notification } from '@/api/types'
import { store, useAppStore } from '@/store/app'
import { useNavigate } from 'react-router-dom'

// Monitors the notification list and pops new, unread high/medium urgency alerts as push banners

export function PushBanner() {
  const navigate = useNavigate()
  const notifications = useAppStore((s) => s.notifications)
  const [banner, setBanner] = useState<Notification | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Pre-seed with all notifications present at mount so only alerts that arrive
  // during this session fire as push banners — prevents cold-load spam.
  const seenIdsRef = useRef(new Set<string>(notifications.map((n) => n.id)))

  useEffect(() => {
    const current = notifications.filter((n) => !n.read && n.urgency !== 'low')
    const unseen = current.filter((n) => !seenIdsRef.current.has(n.id))
    unseen.forEach((n) => seenIdsRef.current.add(n.id))
    if (unseen.length > 0) {
      clearTimeout(timerRef.current)
      setBanner(unseen[0])
      timerRef.current = setTimeout(() => setBanner(null), 5000)
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
    store.markRead(n.id)
    navigate(`/stage/${n.id}`)
    dismiss()
  }

  const alertTitle = banner?.signal === 'below_baseline'
    ? 'Needs attention'
    : banner?.signal === 'above_baseline'
    ? 'Performance spike'
    : 'Creator update'

  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          initial={{ opacity: 0, y: -72, x: '-50%', scale: 0.96 }}
          animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
          exit={{ opacity: 0, y: -36, x: '-50%', scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 520, damping: 42 }}
          className="fixed left-1/2 z-[9998] w-[min(390px,calc(100vw-1.5rem))]"
          style={{ top: 'calc(3.75rem + env(safe-area-inset-top, 0px) + 8px)' }}
          onClick={() => store.markRead(banner.id)}
          role="status"
          aria-live="polite"
        >
          <div
            className={cn(
              'overflow-hidden rounded-[1.35rem] border bg-[#111622]/92 shadow-[0_24px_70px_rgba(0,0,0,.5),0_0_0_1px_rgba(255,255,255,.03)_inset] backdrop-blur-2xl',
              banner.urgency === 'high' ? 'border-orange-400/35' : 'border-amber-400/30',
            )}
          >
            <div className={cn('h-px', banner.urgency === 'high' ? 'bg-orange-300/70' : 'bg-amber-300/60')} />
            <div className="p-3">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[0.95rem] bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-brand-glow">
                  <Zap size={15} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-[13px] font-semibold leading-none text-gray-100">PubIQ</p>
                    <span className="text-[11px] leading-none text-gray-500">now</span>
                    <span
                      className={cn(
                        'ml-auto rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em]',
                        banner.urgency === 'high'
                          ? 'border-orange-300/30 bg-orange-400/12 text-orange-200'
                          : 'border-amber-300/25 bg-amber-400/10 text-amber-200',
                      )}
                    >
                      {banner.urgency}
                    </span>
                  </div>

                  <div className="mt-2 flex items-start gap-2">
                    <div className={cn(
                      'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg',
                      banner.urgency === 'high' ? 'bg-orange-400/12 text-orange-300' : 'bg-amber-400/12 text-amber-300',
                    )}>
                      {banner.signal === 'above_baseline'
                        ? <TrendingUp size={14} />
                        : banner.signal === 'below_baseline'
                        ? <TrendingDown size={14} />
                        : <AlertTriangle size={14} />
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs leading-none">{platformIcon(banner.platform)}</span>
                        <p className="truncate text-sm font-semibold leading-tight text-white">{alertTitle}</p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-gray-300">{banner.insight}</p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); dismiss() }}
                  className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-gray-500 transition hover:bg-white/6 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-95"
                  aria-label="Dismiss notification"
                >
                  <X size={16} />
                </button>
              </div>

              {banner.recommended_action && (
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-2">
                  <p className="max-h-9 min-w-0 flex-1 overflow-hidden text-xs leading-relaxed text-gray-400">
                    {banner.recommended_action}
                  </p>
                  {!banner.approved && (
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); handleAction(banner) }}
                      className={cn(
                        'flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]',
                        banner.urgency === 'high'
                          ? 'bg-brand-500 text-white shadow-brand-glow hover:bg-brand-600'
                          : 'border border-amber-400/25 bg-amber-400/12 text-amber-200 hover:bg-amber-400/18',
                      )}
                    >
                      <Check size={13} />
                      Review
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
