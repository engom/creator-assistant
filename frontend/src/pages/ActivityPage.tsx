import { useState, useEffect } from 'react'
import { Activity, RefreshCw, Server, Cpu, Clock } from 'lucide-react'
import { useAppStore } from '@/store/app'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { CheckpointChart, StatBar } from '@/components/charts/PerformanceChart'
import { cn, formatNumber, formatPercent } from '@/lib/utils'
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
  const [retryCursor, setRetryCursor] = useState(0)

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
  }, [activeId, retryCursor])

  const checkpoints = checkpointData?.checkpoints ?? []
  const latestPost = checkpoints[checkpoints.length - 1] ?? null

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">Alerts</h1>
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

      <div className="card p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {creator.handle.slice(1, 3).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-100">{creator.handle}</h2>
            <p className="text-xs text-gray-500">{formatNumber(creator.followers)} followers · TikTok</p>
          </div>
          <Badge variant={creator.authorized ? 'success' : 'warning'}>
            {creator.authorized ? 'Authorized' : 'Needs auth'}
          </Badge>
        </div>

        <div className="flex gap-2 border-t border-white/5 pt-4">
          {[
            { label: 'Avg views', value: formatNumber(creator.baseline.avg_views) },
            { label: 'Avg retention', value: formatPercent(creator.baseline.avg_retention_pct) },
            { label: 'Sampled', value: `${creator.baseline.sample_size} posts` },
          ].map(({ label, value }) => (
            <div key={label} className="flex-1 flex flex-col gap-0.5 text-center">
              <p className="text-[10px] text-gray-600 uppercase tracking-wide">{label}</p>
              <p className="text-sm font-semibold text-gray-200 tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {creatorNotifs.length > 0 && (
        <div className="card p-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">AI Observations</p>
          <div className="flex flex-col gap-2">
            {creatorNotifs.slice(0, 3).map((n) => {
              const isPositive = n.signal === 'above_baseline'
              return (
                <div key={n.id} className={cn(
                  'flex items-start gap-2.5 rounded-xl px-3 py-2.5 border',
                  isPositive ? 'bg-green-500/[.06] border-green-500/20' : 'bg-amber-500/[.06] border-amber-500/20',
                )}>
                  <span className={cn('mt-0.5 text-sm shrink-0', isPositive ? 'text-green-400' : 'text-amber-400')}>
                    {isPositive ? '✓' : '⚠'}
                  </span>
                  <p className="text-xs text-gray-300 leading-relaxed">{n.insight}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
            onClick={() => setRetryCursor((n) => n + 1)}
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
