import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, ChevronUp, Check, Share2, MessageSquare,
  TrendingUp, TrendingDown, Minus, Clock, Zap,
} from 'lucide-react'
import { cn, timeAgo, formatNumber, formatPercent, signalBg, urgencyBg, platformIcon } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { ZScorePanel } from '@/components/ui/ZScoreBar'
import { store } from '@/store/app'
import type { Notification } from '@/api/types'

interface NotificationCardProps {
  notification: Notification
  onClick?: () => void
}

function SignalIcon({ signal }: { signal: string }) {
  if (signal === 'above_baseline') return <TrendingUp size={14} className="text-green-400" />
  if (signal === 'below_baseline') return <TrendingDown size={14} className="text-red-400" />
  return <Minus size={14} className="text-blue-400" />
}

function UrgencyDot({ urgency }: { urgency: string }) {
  return (
    <span className={cn(
      'w-2 h-2 rounded-full shrink-0',
      urgency === 'high' ? 'bg-red-400 animate-pulse-ring' : urgency === 'medium' ? 'bg-amber-400' : 'bg-gray-500'
    )} />
  )
}

export function NotificationCard({ notification: n, onClick }: NotificationCardProps) {
  const [expanded, setExpanded] = useState(false)

  function handleOpen() {
    if (!n.read) store.markRead(n.id)
    setExpanded((e) => !e)
    onClick?.()
  }

  function handleApprove(e: React.MouseEvent) {
    e.stopPropagation()
    store.approveAction(n.id)
  }

  const isHighUrgency = n.urgency === 'high'
  const hasAction = Boolean(n.recommended_action) && !n.approved

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'card border cursor-pointer transition-all duration-200',
        !n.read ? 'border-brand-500/30 bg-brand-500/5' : 'border-surface-dark-border',
        isHighUrgency && !n.read ? 'border-red-500/30 bg-red-500/5' : '',
        'hover:border-white/15',
      )}
      onClick={handleOpen}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        {/* Left: urgency dot + platform */}
        <div className="flex flex-col items-center gap-2 pt-0.5">
          <UrgencyDot urgency={n.urgency} />
          <span className="text-base leading-none">{platformIcon(n.platform)}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-semibold text-gray-300">
              {n.creator_id.replace('creator_', '@')}
            </span>
            <span className="text-xs text-gray-600">·</span>
            <span className="text-xs text-gray-500 font-mono">{n.post_id}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <Badge variant={n.urgency === 'high' ? 'danger' : n.urgency === 'medium' ? 'warning' : 'muted'}>
                {n.urgency}
              </Badge>
              <span className={cn('badge border text-xs', signalBg(n.signal))}>
                <SignalIcon signal={n.signal} />
                {n.signal.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-200 leading-relaxed">{n.insight}</p>

          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Clock size={11} />
              {timeAgo(n.received_at)}
            </span>
            {n.notification_dispatched && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Zap size={11} />
                Notified
              </span>
            )}
            {n.approved && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <Check size={11} />
                Approved
              </span>
            )}
          </div>
        </div>

        {/* Expand toggle */}
        <button className="shrink-0 text-gray-600 hover:text-gray-300 transition-colors mt-0.5">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pb-4 border-t border-white/5 pt-4">
              {/* Recommended action */}
              {n.recommended_action && (
                <div className={cn(
                  'rounded-xl p-3 mb-4 border',
                  isHighUrgency ? 'bg-red-500/8 border-red-500/20' : 'bg-amber-500/8 border-amber-500/20'
                )}>
                  <p className="text-xs font-semibold text-gray-400 mb-1">AI Recommendation</p>
                  <p className="text-sm text-gray-200">{n.recommended_action}</p>
                </div>
              )}

              {/* Z-scores */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Performance vs. Creator Baseline
                </p>
                <ZScorePanel zScores={n.z_scores} />
              </div>

              {/* Current stats */}
              <div className="grid grid-cols-5 gap-2 mb-4">
                {[
                  { label: 'Views', value: formatNumber(n.current_stats.views) },
                  { label: 'Likes', value: formatNumber(n.current_stats.likes) },
                  { label: 'Comments', value: formatNumber(n.current_stats.comments) },
                  { label: 'Shares', value: formatNumber(n.current_stats.shares) },
                  { label: 'Retention', value: formatPercent(n.current_stats.retention_pct) },
                ].map((s) => (
                  <div key={s.label} className="bg-white/3 rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-500">{s.label}</p>
                    <p className="text-sm font-semibold text-gray-200 tabular-nums">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {hasAction && (
                  <button
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                      isHighUrgency
                        ? 'bg-brand-500 hover:bg-brand-600 text-white'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
                    )}
                    onClick={handleApprove}
                  >
                    <Check size={14} />
                    Approve action
                  </button>
                )}
                <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-gray-300 transition-all">
                  <MessageSquare size={14} />
                  View post
                </button>
                {n.signal === 'above_baseline' && (
                  <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-gray-300 transition-all">
                    <Share2 size={14} />
                    Stage cross-post
                  </button>
                )}
              </div>

              {/* Trace info */}
              <div className="mt-3 pt-3 border-t border-white/5">
                <p className="text-xs text-gray-600">
                  Analyzed in {n.total_latency_ms.toFixed(0)}ms
                  {' · '}{Object.keys(n.trace_ids).length} agents
                  {' · '}<span className="font-mono">{Object.values(n.trace_ids)[0]?.slice(0, 8)}…</span>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
