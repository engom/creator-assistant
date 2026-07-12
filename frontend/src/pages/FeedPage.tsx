import { motion } from 'framer-motion'
import { Filter, TrendingUp, Bell, Users } from 'lucide-react'
import { useState } from 'react'
import { useAppStore, store } from '@/store/app'
import { NotificationCard } from '@/components/notifications/NotificationCard'
import { StatTile } from '@/components/ui/StatTile'
import { cn, formatNumber } from '@/lib/utils'
import type { Urgency } from '@/api/types'

const FILTERS: Array<{ label: string; value: Urgency | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

export function FeedPage() {
  const notifications = useAppStore((s) => s.notifications)
  const creators = useAppStore((s) => s.creators)
  const [filter, setFilter] = useState<Urgency | 'all'>('all')

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter((n) => n.urgency === filter)

  const unread = notifications.filter((n) => !n.read).length
  const highCount = notifications.filter((n) => n.urgency === 'high').length
  const dispatched = notifications.filter((n) => n.notification_dispatched).length

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="Active alerts"
          value={unread}
          sub="unread"
          trend={unread > 0 ? 'up' : 'neutral'}
        />
        <StatTile
          label="High urgency"
          value={highCount}
          sub="need action"
          trend={highCount > 0 ? 'up' : 'neutral'}
          trendValue={highCount > 0 ? `${highCount} pending` : undefined}
        />
        <StatTile
          label="Creators"
          value={creators.filter((c) => c.authorized).length}
          sub={`of ${creators.length} total`}
        />
        <StatTile
          label="Dispatched"
          value={dispatched}
          sub="notified"
          trend="neutral"
        />
      </div>

      {/* Creator chips */}
      <div className="flex gap-2 flex-wrap">
        {creators.map((c) => (
          <button
            key={c.id}
            onClick={() => store.setActiveCreator(c.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all',
              'bg-surface-dark-muted border-surface-dark-border text-gray-400 hover:border-white/20 hover:text-gray-200',
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            {c.handle}
            <span className="text-gray-600">{formatNumber(c.followers)}</span>
            {!c.authorized && (
              <span className="text-amber-500 text-[10px]">⚠ Unauth</span>
            )}
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5">
        <Filter size={14} className="text-gray-500 mr-1" />
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium transition-all',
              filter === f.value
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5',
            )}
          >
            {f.label}
            {f.value !== 'all' && (
              <span className="ml-1.5 text-gray-600">
                {notifications.filter((n) => n.urgency === f.value).length}
              </span>
            )}
          </button>
        ))}
        {unread > 0 && (
          <button
            onClick={() => store.markAllRead()}
            className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Alert list */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-20 text-center"
          >
            <Bell size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No {filter !== 'all' ? filter + ' ' : ''}alerts</p>
          </motion.div>
        ) : (
          <motion.div layout className="flex flex-col gap-2">
            {filtered.map((n) => (
              <NotificationCard key={n.id} notification={n} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
