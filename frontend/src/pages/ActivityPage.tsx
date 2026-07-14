import { useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, RefreshCw, Server, Cpu } from 'lucide-react'
import { useAppStore } from '@/store/app'
import { Badge } from '@/components/ui/Badge'
import { CheckpointChart, StatBar } from '@/components/charts/PerformanceChart'
import { cn, timeAgo, formatNumber, formatPercent, urgencyBg, signalBg } from '@/lib/utils'
import { DEMO_CREATORS } from '@/data/demo'

// Simulated checkpoint timeline per creator
const DEMO_CHECKPOINTS = {
  eurafricanews: [
    { offset_min: 30, views: 24000, likes: 1800, shares: 210, baseline_views: 16000 },
    { offset_min: 45, views: 51000, likes: 3900, shares: 560, baseline_views: 24000 },
    { offset_min: 60, views: 83000, likes: 6300, shares: 910, baseline_views: 32000 },
    { offset_min: 90, views: 104000, likes: 7900, shares: 1150, baseline_views: 42000 },
  ],
  elpanthio: [
    { offset_min: 30, views: 9500, likes: 680, shares: 48, baseline_views: 6300 },
    { offset_min: 45, views: 16000, likes: 1180, shares: 72, baseline_views: 9450 },
    { offset_min: 60, views: 24000, likes: 1740, shares: 88, baseline_views: 12600 },
    { offset_min: 90, views: 29000, likes: 2100, shares: 98, baseline_views: 16800 },
  ],
}

export function ActivityPage() {
  const notifications = useAppStore((s) => s.notifications)
  const [activeId, setActiveId] = useState(DEMO_CREATORS[0].id)
  const creator = DEMO_CREATORS.find((c) => c.id === activeId)!
  const checkpoints = DEMO_CHECKPOINTS[activeId as keyof typeof DEMO_CHECKPOINTS] ?? []
  const latestStats = checkpoints[checkpoints.length - 1] ?? null
  const creatorNotifs = notifications.filter((n) => n.creator_id === activeId)

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">Activity</h1>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live monitoring
          </span>
        </div>
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

      {/* Creator overview */}
      <div className="card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-100">{creator.handle}</h2>
            <p className="text-sm text-gray-500">{formatNumber(creator.followers)} followers · TikTok</p>
          </div>
          <Badge variant={creator.authorized ? 'success' : 'warning'}>
            {creator.authorized ? 'Authorized' : 'Needs auth'}
          </Badge>
        </div>

        {/* Baseline stats */}
        <div className="mb-1">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
            Baseline (last {creator.baseline.sample_size} posts)
          </p>
          <div className="flex flex-col gap-2">
            {[
              { label: 'Views', current: latestStats?.views ?? 0, baseline: creator.baseline.avg_views, max: creator.baseline.avg_views * 3 },
              { label: 'Likes', current: latestStats?.likes ?? 0, baseline: creator.baseline.avg_likes, max: creator.baseline.avg_likes * 3 },
              { label: 'Shares', current: latestStats?.shares ?? 0, baseline: creator.baseline.avg_shares, max: creator.baseline.avg_shares * 3 },
            ].map((s) => (
              <StatBar key={s.label} {...s} />
            ))}
          </div>
        </div>
      </div>

      {/* Checkpoint chart */}
      {checkpoints.length > 0 ? (
        <div className="card p-5 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-brand-400" />
            <p className="text-sm font-semibold text-gray-300">View velocity over time</p>
            <span className="ml-auto text-xs text-gray-600">Latest active post</span>
          </div>
          <CheckpointChart data={checkpoints} />
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-brand-500 inline-block rounded" /> Current
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-white/20 inline-block rounded" style={{ borderTop: '1px dashed' }} /> Baseline
            </span>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center">
          <RefreshCw size={24} className="text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No active monitoring for this creator.</p>
          {!creator.authorized && (
            <a
              href={`/api/auth/tiktok/authorize?creator_id=${creator.id}`}
              className="mt-3 inline-flex min-h-11 items-center rounded-xl px-3 text-xs text-brand-400 transition hover:bg-brand-500/10 hover:text-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"
            >
              Authorize TikTok →
            </a>
          )}
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
                    <span className={cn('badge border text-xs', signalBg(n.signal))}>{n.signal.replace(/_/g, ' ')}</span>
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
            { name: 'monitoring-agent', label: 'Monitor' },
            { name: 'analytics-agent', label: 'Analytics' },
            { name: 'insight-agent',   label: 'Insight' },
            { name: 'notification-agent', label: 'Notify' },
          ].map((a) => (
            <div key={a.name} className="flex items-center gap-2.5 p-2.5 bg-white/3 rounded-xl border border-white/5">
              <Cpu size={12} className="text-brand-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-300">{a.label}</p>
                <p className="text-[10px] text-gray-600 font-mono truncate">{a.name}</p>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
