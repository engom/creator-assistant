import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, ChevronUp, Check, Share2, MessageSquare,
  TrendingUp, TrendingDown, Minus, Clock, Zap,
} from 'lucide-react'
import { cn, timeAgo, formatNumber, formatPercent, signalBg, signalLabel, platformIcon } from '@/lib/utils'
import { ZScorePanel } from '@/components/ui/ZScoreBar'
import { store, useAppStore } from '@/store/app'
import type { Notification } from '@/api/types'
import { useNavigate } from 'react-router-dom'

interface NotificationCardProps {
  notification: Notification
  onClick?: () => void
}

function SignalIcon({ signal }: { signal: string }) {
  if (signal === 'above_baseline') return <TrendingUp size={10} className="text-signal-above" />
  if (signal === 'below_baseline') return <TrendingDown size={10} className="text-signal-below" />
  return <Minus size={10} className="text-signal-within" />
}

function urgencyAccent(urgency: string): string {
  if (urgency === 'high')   return '#f87171'
  if (urgency === 'medium') return '#fbbf24'
  return 'transparent'
}

export function NotificationCard({ notification: n, onClick }: NotificationCardProps) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const creators = useAppStore((s) => s.creators)
  const creatorHandle = creators.find((c) => c.id === n.creator_id)?.handle ?? '@' + n.creator_id

  function handleOpen() {
    if (!n.read) store.markRead(n.id)
    setExpanded((e) => !e)
    onClick?.()
  }

  function handleApprove(e: React.MouseEvent) {
    e.stopPropagation()
    store.approveAction(n.id)
  }

  function handleStage(e: React.MouseEvent) {
    e.stopPropagation()
    navigate(`/stage/${n.id}`)
  }

  const isHighUrgency = n.urgency === 'high'
  const hasAction = Boolean(n.recommended_action) && !n.approved

  const cardBorder = !n.read && isHighUrgency
    ? 'border-red-500/20'
    : !n.read && n.urgency === 'medium'
    ? 'border-amber-500/15'
    : 'border-surface-dark-border'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex overflow-hidden rounded-2xl border cursor-pointer transition-all duration-200',
        'bg-surface-dark-muted hover:bg-surface-dark-hover',
        cardBorder,
      )}
      onClick={handleOpen}
    >
      {/* Left accent bar */}
      <div
        className="w-[3px] shrink-0 rounded-l-2xl transition-colors duration-300"
        style={{ background: urgencyAccent(n.urgency) }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-start gap-2.5 px-4 pt-3.5 pb-3">
          <span className="text-base leading-none mt-0.5 shrink-0">{platformIcon(n.platform)}</span>

          <div className="flex-1 min-w-0">
            {/* Creator + post title + signal badge */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-200">{creatorHandle}</span>
              <span className="text-gray-700">·</span>
              <span
                className="text-[12px] text-gray-500 truncate max-w-[150px]"
                title={n.post_title || n.post_id}
              >
                {n.post_title || n.post_id}
              </span>
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <span className={cn('badge border', signalBg(n.signal))}>
                  <SignalIcon signal={n.signal} />
                  {signalLabel(n.signal)}
                </span>
              </div>
            </div>

            {/* Insight — hero text */}
            <p className="text-[15px] leading-snug text-gray-100 font-normal">{n.insight}</p>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-[11px] text-gray-600">
                <Clock size={10} />
                {timeAgo(n.received_at)}
              </span>
              {n.notification_dispatched && (
                <span className="flex items-center gap-1 text-[11px] text-gray-600">
                  <Zap size={10} />
                  Notified
                </span>
              )}
              {n.approved && (
                <span className="flex items-center gap-1 text-[11px] text-green-500">
                  <Check size={10} />
                  Approved
                </span>
              )}
              <button className="-mr-2 ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-xl text-gray-600 transition-colors hover:bg-white/5 hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-95" aria-label={expanded ? 'Collapse alert details' : 'Expand alert details'}>
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* Expanded detail */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 pb-4 pt-3 border-t border-white/4">
                {/* Recommended action */}
                {n.recommended_action && (
                  <div
                    className={cn(
                      'rounded-xl p-3 mb-4 border',
                      isHighUrgency
                        ? 'bg-red-500/6 border-red-500/15'
                        : 'bg-amber-500/6 border-amber-500/15',
                    )}
                  >
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      AI Recommendation
                    </p>
                    <p className="text-sm text-gray-200 leading-relaxed">{n.recommended_action}</p>
                  </div>
                )}

                {/* Current stats — DM Mono numbers */}
                <div className="grid grid-cols-5 gap-1.5 mb-4">
                  {[
                    { label: 'Views',     value: formatNumber(n.current_stats.views) },
                    { label: 'Likes',     value: formatNumber(n.current_stats.likes) },
                    { label: 'Comments',  value: formatNumber(n.current_stats.comments) },
                    { label: 'Shares',    value: formatNumber(n.current_stats.shares) },
                    { label: 'Retention', value: formatPercent(n.current_stats.retention_pct) },
                  ].map((s) => (
                    <div key={s.label} className="bg-white/3 rounded-xl p-2 text-center">
                      <p className="text-[10px] text-gray-600 mb-0.5">{s.label}</p>
                      <p
                        className="text-sm font-medium text-gray-100"
                        style={{ fontFamily: "'DM Mono', monospace" }}
                      >
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Z-score panel */}
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2.5">
                    vs. Creator baseline
                  </p>
                  <ZScorePanel zScores={n.z_scores} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {hasAction && (
                    <button
                      className={cn(
                        'flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]',
                        isHighUrgency
                          ? 'bg-brand-500 hover:bg-brand-600 text-white'
                          : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/25',
                      )}
                      onClick={handleApprove}
                    >
                      <Check size={13} />
                      Approve action
                    </button>
                  )}
                  <button className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white/4 px-3 text-sm font-medium text-gray-400 transition-all hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]">
                    <MessageSquare size={13} />
                    View post
                  </button>
                  {n.signal === 'above_baseline' && (
                    <button onClick={handleStage} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white/4 px-3 text-sm font-medium text-gray-400 transition-all hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]">
                      <Share2 size={13} />
                      Stage cross-post
                    </button>
                  )}
                </div>

                {/* Trace */}
                <div className="mt-3 pt-3 border-t border-white/4">
                  <p
                    className="text-[11px] text-gray-600"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {n.total_latency_ms.toFixed(0)}ms · {Object.keys(n.trace_ids).length} agents · {Object.values(n.trace_ids)[0]?.slice(0, 8)}…
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
