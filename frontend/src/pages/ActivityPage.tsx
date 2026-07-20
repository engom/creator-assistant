import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Activity, RefreshCw, Server, Cpu, Clock } from 'lucide-react'
import { useAppStore } from '@/store/app'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { CheckpointChart, StatBar } from '@/components/charts/PerformanceChart'
import { cn, timeAgo, formatNumber, formatPercent, urgencyBg, signalBg, signalLabel } from '@/lib/utils'
import { api, ApiError } from '@/api/client'
import { DEMO_CREATORS } from '@/data/demo'
import type { PostCheckpoint, CheckpointsResponse } from '@/api/types'

export function ActivityPage() {
  const notifications = useAppStore((s) => s.notifications)
  const [activeId, setActiveId] = useState(DEMO_CREATORS[0].id)
  const creator = DEMO_CREATORS.find((c) => c.id === activeId)!
  const creatorNotifs = notifications.filter((n) => n.creator_id === activeId)

  const [checkpointData, setCheckpointData] = useState<CheckpointsResponse | null>(null)
  const [checkpointsLoading, setCheckpointsLoading] = useState(false)
  const [checkpointsError, setCheckpointsError] = useState<'unreachable' | 'db' | null>(null)

  useEffect(() => {
    let cancelled = false
    setCheckpointsLoading(true)
    setCheckpointData(null)
    setCheckpointsError(null)
    api.getCreatorCheckpoints(activeId).then((data) => {
      if (cancelled) return
      // Attach baseline_views to each checkpoint from the returned baseline mean
      const viewsMean = data.baseline['views']?.mean ?? 0
      const checkpoints: PostCheckpoint[] = data.checkpoints.map((cp, i) => ({
        ...cp,
        baseline_views: Math.round(viewsMean * (0.4 + i * 0.2)),
      }))
      setCheckpointData({ ...data, checkpoints })
    }).catch((err) => {
      if (cancelled) return
      if (err instanceof ApiError && err.status === 503) {
        setCheckpointsError('db')
      } else {
        setCheckpointsError('unreachable')
      }
    }).finally(() => {
      if (!cancelled) setCheckpointsLoading(false)
    })
    return () => { cancelled = true }
  }, [activeId])

  const checkpoints = checkpointData?.checkpoints ?? []
  const latestPost = checkpoints[checkpoints.length - 1] ?? null

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">Activity</h1>
        <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Live monitoring
        </span>
      </div>

      {/* Creator tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {DEMO_CREATORS.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className={cn(
              'flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium whitespace-nowrap transition-all focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]',
              activeId === c.id
                ? 'bg-brand-500/20 border-brand-500/40 text-brand-300'
                : 'bg-white/3 border-white/8 text-gray-400 hover:border-white/15 hover:text-gray-200',
            )}
          >
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-[9px] font-bold text-white">
              {c.handle.slice(1, 3).toUpperCase()}
            </div>
            {c.handle}
          </button>
        ))}
      </div>

      <div className="card p-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-100">{creator.handle}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{formatNumber(creator.followers)} followers · TikTok</p>
          </div>
          <Badge variant={creator.authorized ? 'success' : 'warning'}>
            {creator.authorized ? 'Authorized' : 'Needs auth'}
          </Badge>
        </div>

        <div className="border-t border-white/5 pt-4">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-3">
            Historical avg · last {creator.baseline.sample_size} posts
          </p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {[
              { label: 'Views',  value: creator.baseline.avg_views,  std: creator.baseline.std_views, pct: false },
              { label: 'Likes',  value: creator.baseline.avg_likes,  std: creator.baseline.std_likes, pct: false },
            ].map(({ label, value, std }) => (
              <div key={label} className="bg-white/4 rounded-xl p-3 flex flex-col gap-1">
                <p className="text-[10px] text-gray-600 uppercase tracking-wide">{label}</p>
                <p className="text-sm font-semibold text-gray-200 tabular-nums">{formatNumber(value)}</p>
                <p className="text-[10px] text-gray-600 tabular-nums">±{formatNumber(std)}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Shares',  value: creator.baseline.avg_shares,        std: creator.baseline.std_shares },
              { label: 'Ret. %',  value: creator.baseline.avg_retention_pct, std: creator.baseline.std_retention_pct, isPct: true },
              { label: 'n',       value: creator.baseline.sample_size,        std: 0, isCount: true },
            ].map(({ label, value, std, isPct, isCount }) => (
              <div key={label} className="bg-white/4 rounded-xl p-3 flex flex-col gap-1">
                <p className="text-[10px] text-gray-600 uppercase tracking-wide">{label}</p>
                <p className="text-sm font-semibold text-gray-200 tabular-nums">
                  {isCount ? value : isPct ? formatPercent(value) : formatNumber(value)}
                </p>
                {!isCount && <p className="text-[10px] text-gray-600 tabular-nums">±{isPct ? formatPercent(std) : formatNumber(std)}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {checkpointsLoading ? (
        <div className="card p-8 flex items-center justify-center gap-3">
          <Spinner size="sm" />
          <p className="text-sm text-gray-500">Loading activity…</p>
        </div>
      ) : checkpointsError ? (
        <div className="card p-8 text-center">
          <RefreshCw size={24} className="text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {checkpointsError === 'db' ? 'Database unavailable.' : 'Could not reach the server.'}
          </p>
          <button
            onClick={() => setActiveId((id) => id)}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl px-3 text-xs text-brand-400 transition hover:bg-brand-500/10 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"
          >
            Retry
          </button>
        </div>
      ) : checkpoints.length > 0 && latestPost ? (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-5 pb-4 border-b border-white/5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse shrink-0" />
            <p className="text-sm font-semibold text-gray-200 flex-1">Latest post · T+{latestPost.offset_min}</p>
            <span className="flex items-center gap-1 text-[10px] text-gray-600">
              <Clock size={10} />
              snapshot
            </span>
          </div>

          {/* Stat comparison rows */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-3">
              This post vs. account avg
            </p>
            <div className="flex flex-col gap-2.5">
              {[
                { label: 'Views',  current: latestPost.views,         baseline: creator.baseline.avg_views },
                { label: 'Likes',  current: latestPost.likes,         baseline: creator.baseline.avg_likes },
                { label: 'Shares', current: latestPost.shares,        baseline: creator.baseline.avg_shares },
                { label: 'Ret. %', current: latestPost.retention_pct, baseline: creator.baseline.avg_retention_pct, isPct: true },
              ].map((s) => (
                <StatBar key={s.label} {...s} />
              ))}
            </div>
          </div>

          {/* Velocity chart */}
          <div className="px-5 pt-4 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={13} className="text-brand-400" />
              <p className="text-xs font-semibold text-gray-400">View velocity</p>
            </div>
            <CheckpointChart data={checkpoints} />
            <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-brand-500 inline-block rounded" /> This post
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-white/20 inline-block rounded" /> Avg baseline
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center">
          <RefreshCw size={24} className="text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No active post being monitored yet.</p>
          <p className="text-xs text-gray-600 mt-1">Run the pipeline on a video to start tracking.</p>
        </div>
      )}

      {/* Recent alerts for creator */}
      {creatorNotifs.length > 0 && (
        <div className="card p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Recent alerts
          </p>
          <div className="flex flex-col gap-2">
            {creatorNotifs.slice(0, 5).map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-start gap-3 p-3 bg-white/3 rounded-xl border border-white/5"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('badge border text-xs', urgencyBg(n.urgency))}>{n.urgency}</span>
                    <span className={cn('badge border text-xs', signalBg(n.signal))}>{signalLabel(n.signal)}</span>
                    <span className="ml-auto text-xs text-gray-600">{timeAgo(n.received_at)}</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{n.insight}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Agent status */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server size={14} className="text-gray-500" />
          <p className="text-sm font-semibold text-gray-500">Agent status</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { name: 'monitoring-agent',   label: 'Monitoring', status: 'Watching for new posts' },
            { name: 'analytics-agent',    label: 'Analytics',  status: 'Computing baselines' },
            { name: 'insight-agent',      label: 'Insight',    status: 'Generating insight' },
            { name: 'notification-agent', label: 'Notify',     status: 'Routing alerts' },
          ].map((a) => (
            <div key={a.name} className="flex items-center gap-2.5 p-2.5 bg-white/3 rounded-xl border border-white/5">
              <Cpu size={12} className="text-brand-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-300">{a.label}</p>
                <p className="text-[10px] text-gray-600 truncate">{a.status}</p>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
