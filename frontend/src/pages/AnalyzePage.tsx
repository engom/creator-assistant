import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Zap, CheckCircle, AlertCircle, ChevronDown, RefreshCw, Video, TrendingUp } from 'lucide-react'
import { api, ApiError } from '@/api/client'
import { store } from '@/store/app'
import { toast } from '@/components/ui/Toast'
import { ZScorePanel } from '@/components/ui/ZScoreBar'
import { ZScoreRadar } from '@/components/charts/PerformanceChart'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { ServerUnreachable } from '@/components/ui/ServerUnreachable'
import { cn, signalBg, signalLabel, urgencyBg, formatNumber, formatPercent } from '@/lib/utils'
import type { AnalyzePostResponse, TikTokVideo, TikTokProfile, ForecastStat, HistoricalBaseline } from '@/api/types'
import { STAT_LABELS } from '@/components/ui/ZScoreBar'
import { genId } from '@/lib/utils'
import { DEMO_CREATORS, DEMO_ANALYZE_REQUEST } from '@/data/demo'

function computeBaseline(vids: TikTokVideo[]): HistoricalBaseline | null {
  if (vids.length < 3) return null
  const fields = ['view_count', 'like_count', 'comment_count', 'share_count', 'retention_pct'] as const
  const keys   = ['views',      'likes',      'comments',      'shares',      'retention_pct'] as const

  const means: Record<string, number> = {}
  const stds:  Record<string, number> = {}

  for (let i = 0; i < fields.length; i++) {
    const vals = vids.map((v) => fields[i] === 'retention_pct' ? v.retention_pct : (v as any)[fields[i]] as number)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
    means[keys[i]] = mean
    stds[keys[i]]  = std
  }

  return {
    avg_views:         means.views,
    std_views:         stds.views,
    avg_likes:         means.likes,
    std_likes:         stds.likes,
    avg_comments:      means.comments,
    std_comments:      stds.comments,
    avg_shares:        means.shares,
    std_shares:        stds.shares,
    avg_retention_pct: means.retention_pct,
    std_retention_pct: stds.retention_pct,
    sample_size:       vids.length,
  }
}

// Parse "ML forecast at T+60 (model, n=3): forecast_views=18600 forecast_likes=1200 ..."
function parseForecastContext(
  ctx: string,
): { stats: ForecastStat[]; confidence: string; n: number } | null {
  if (!ctx) return null
  const header = ctx.match(/\((\w+),\s*n=(\d+)\)/)
  if (!header) return null
  const confidence = header[1]
  const n = parseInt(header[2], 10)
  const stats: ForecastStat[] = []
  const pairs = ctx.matchAll(/forecast_(\w+)=([\d.?]+)(%?)/g)
  for (const [, rawStat, rawVal, pct] of pairs) {
    const val = parseFloat(rawVal)
    if (isNaN(val)) continue
    stats.push({ stat: rawStat, value: val, unit: pct === '%' ? 'pct' : 'count' })
  }
  if (stats.length === 0) return null
  return { stats, confidence, n }
}

function ForecastCard({
  forecastContext,
  currentStats,
}: {
  forecastContext: string
  currentStats: Record<string, number>
}) {
  const parsed = parseForecastContext(forecastContext)
  if (!parsed) return null

  const { stats, confidence, n } = parsed

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={14} className="text-brand-400" />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          T+60 Forecast
        </p>
        <span className="ml-auto text-[10px] font-mono text-gray-600 border border-white/10 rounded px-1.5 py-0.5">
          {confidence} · n={n}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {stats.map(({ stat, value, unit }) => {
          const label = STAT_LABELS[stat] ?? stat
          const current = currentStats[stat] ?? currentStats[stat.replace('_pct', '')] ?? 0
          const growth = current > 0 ? ((value - current) / current) * 100 : 0
          const growing = value >= current

          return (
            <div key={stat} className="flex items-center gap-3">
              <p className="w-20 shrink-0 text-xs text-gray-500">{label}</p>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                {/* T+30 bar (current) */}
                <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div className="h-full bg-gray-500/60 rounded-full" style={{ width: '100%' }} />
                </div>
                {/* T+60 bar (forecast) */}
                <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      growing ? 'bg-brand-400/80' : 'bg-amber-400/80',
                    )}
                    style={{ width: `${Math.min((value / (current || value)) * 100, 200)}%` }}
                  />
                </div>
              </div>
              <div className="w-24 shrink-0 text-right">
                <span className="text-xs font-semibold text-gray-200 tabular-nums">
                  {unit === 'pct' ? formatPercent(value) : formatNumber(value)}
                </span>
                {current > 0 && (
                  <span className={cn(
                    'ml-1.5 text-[10px] tabular-nums',
                    growing ? 'text-brand-400' : 'text-amber-400',
                  )}>
                    {growing ? '+' : ''}{growth.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[10px] text-gray-600 leading-relaxed">
        {confidence === 'model'
          ? `Projection trained on ${n} prior checkpoint pair${n !== 1 ? 's' : ''} for this post.`
          : `Projection based on ${n} checkpoint pair${n !== 1 ? 's' : ''}. Confidence increases with more data.`}
        {' '}Not a guarantee — use alongside the z-score analysis.
      </p>
    </div>
  )
}

function StatTile({ label, value, pct }: { label: string; value: number; pct: boolean }) {
  return (
    <div className="bg-white/4 rounded-xl p-3 flex flex-col items-center gap-1 text-center">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider leading-none">{label}</p>
      <p className="text-base font-bold text-gray-100 tabular-nums leading-tight">
        {pct ? formatPercent(value, 1) : formatNumber(value)}
      </p>
    </div>
  )
}

type Step = 'form' | 'running' | 'result'

const AGENT_STEPS = [
  { id: 'monitoring-agent',    label: 'Monitoring Agent',   desc: 'Detecting post, scheduling polls' },
  { id: 'analytics-agent',     label: 'Analytics Agent',    desc: 'Computing z-scores vs baseline' },
  { id: 'insight-agent',       label: 'Insight Agent',      desc: 'Generating grounded insight (AI)' },
  { id: 'notification-agent',  label: 'Notification Agent', desc: 'Routing alert by urgency' },
]

function AgentStepRow({
  step,
  status,
  traceId,
}: {
  step: typeof AGENT_STEPS[number]
  status: 'pending' | 'running' | 'done' | 'error'
  traceId?: string
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300',
      status === 'running' ? 'bg-brand-500/10 border-brand-500/30' :
      status === 'done'    ? 'bg-green-500/8 border-green-500/20' :
      status === 'error'   ? 'bg-red-500/8 border-red-500/20' :
      'bg-white/3 border-white/5',
    )}>
      <div className="w-5 h-5 shrink-0 flex items-center justify-center">
        {status === 'running' && <Spinner size="sm" />}
        {status === 'done'    && <CheckCircle size={16} className="text-green-400" />}
        {status === 'error'   && <AlertCircle size={16} className="text-red-400" />}
        {status === 'pending' && <div className="w-2 h-2 rounded-full bg-gray-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium',
          status === 'done' ? 'text-gray-200' :
          status === 'running' ? 'text-brand-300' :
          'text-gray-500'
        )}>
          {step.label}
        </p>
        <p className="text-xs text-gray-600">{step.desc}</p>
      </div>
      {traceId && (
        <span className="text-[10px] font-mono text-gray-600">{traceId.slice(0, 8)}…</span>
      )}
    </div>
  )
}

export function AnalyzePage() {
  const [step, setStep] = useState<Step>('form')
  const [agentProgress, setAgentProgress] = useState<Record<string, 'pending' | 'running' | 'done' | 'error'>>({})
  const [result, setResult] = useState<AnalyzePostResponse | null>(null)
  const [lastStats, setLastStats] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<'network' | 'server' | null>(null)
  const [selectedCreator, setSelectedCreator] = useState(DEMO_CREATORS[0])
  const [showTrace, setShowTrace] = useState(false)
  const [videos, setVideos] = useState<TikTokVideo[]>([])
  const [videosLoading, setVideosLoading] = useState(false)
  const [videosError, setVideosError] = useState<'unreachable' | 'auth' | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<TikTokVideo | null>(null)
  const [profiles, setProfiles] = useState<Record<string, TikTokProfile>>({})

  useEffect(() => {
    let cancelled = false
    const authorized = DEMO_CREATORS.filter((c) => c.authorized)
    Promise.all(authorized.map((c) => api.getCreatorProfile(c.id).catch(() => null))).then((results) => {
      if (cancelled) return
      const next: Record<string, TikTokProfile> = {}
      authorized.forEach((c, i) => { if (results[i]) next[c.id] = results[i]! })
      setProfiles(next)
    })
    return () => { cancelled = true }
  }, [])

  function classifyVideoError(err: unknown): 'unreachable' | 'auth' {
    return err instanceof ApiError && err.status === 401 ? 'auth' : 'unreachable'
  }

  function doFetchVideos(creatorId: string, cancelled: () => boolean) {
    setVideosLoading(true)
    setVideosError(null)
    setVideos([])
    setSelectedVideo(null)
    api.listCreatorVideos(creatorId).then((vidRes) => {
      if (cancelled()) return
      const vids = vidRes?.videos ?? []
      setVideos(vids)
      if (vids.length > 0) setSelectedVideo(vids[0])
    }).catch((err) => {
      if (cancelled()) return
      setVideosError(classifyVideoError(err))
    }).finally(() => {
      if (!cancelled()) setVideosLoading(false)
    })
  }

  useEffect(() => {
    if (!selectedCreator.authorized) {
      setVideos([])
      setSelectedVideo(null)
      return
    }
    let gone = false
    setStep('form')
    setResult(null)
    setError(null)
    setAgentProgress({})
    doFetchVideos(selectedCreator.id, () => gone)
    return () => { gone = true }
  }, [selectedCreator.id])

  async function runAnalysis() {
    setStep('running')
    setError(null)
    setResult(null)

    const agentIds = AGENT_STEPS.map((s) => s.id)
    let cancelled = false

    // Tick each agent to 'running' sequentially; stop if response arrives first
    const initialProgress: Record<string, 'pending' | 'running' | 'done' | 'error'> = {}
    agentIds.forEach((id) => { initialProgress[id] = 'pending' })
    setAgentProgress({ ...initialProgress })

    const timers: ReturnType<typeof setTimeout>[] = []
    const delays = [0, 400, 900, 1500]
    agentIds.forEach((id, i) => {
      timers.push(setTimeout(() => {
        if (cancelled) return
        setAgentProgress((prev) => {
          if (prev[id] === 'done' || prev[id] === 'error') return prev
          return { ...prev, [id]: 'running' }
        })
      }, delays[i]))
    })

    const liveStats = selectedVideo
      ? {
          views: selectedVideo.view_count,
          likes: selectedVideo.like_count,
          comments: selectedVideo.comment_count,
          shares: selectedVideo.share_count,
          retention_pct: selectedVideo.retention_pct,
        }
      : DEMO_ANALYZE_REQUEST.current_stats

    const req = {
      ...DEMO_ANALYZE_REQUEST,
      creator_id: selectedCreator.id,
      post_id: selectedVideo ? selectedVideo.id : `vid_live_${Math.random().toString(36).slice(2, 8)}`,
      detected_at: selectedVideo
        ? new Date(selectedVideo.create_time * 1000).toISOString()
        : DEMO_ANALYZE_REQUEST.detected_at,
      current_stats: liveStats,
      historical_baseline: (() => {
        if (selectedCreator.baseline.sample_size >= 3) return selectedCreator.baseline
        // Exclude the selected video from its own baseline (leave-one-out)
        const baselineVids = selectedVideo
          ? videos.filter((v) => v.id !== selectedVideo.id)
          : videos
        return baselineVids.length >= 3
          ? computeBaseline(baselineVids) ?? selectedCreator.baseline
          : selectedCreator.baseline
      })(),
    }

    setLastStats(liveStats as Record<string, number>)

    try {
      const res = await api.analyzePost(req)

      // Cancel pending ticks, mark all done
      cancelled = true
      timers.forEach(clearTimeout)
      const done: Record<string, 'done'> = {}
      agentIds.forEach((id) => { done[id] = 'done' })
      setAgentProgress(done)

      setResult(res)
      setStep('result')

      // Push as notification
      store.addNotification({
        id: genId(),
        creator_id: res.creator_id,
        post_id: res.post_id,
        post_title: selectedVideo?.video_description || undefined,
        platform: 'tiktok',
        urgency: res.urgency,
        signal: res.signal as import('@/api/types').Signal,
        insight: res.insight,
        recommended_action: res.recommended_action,
        z_scores: res.z_scores,
        current_stats: req.current_stats,
        notification_dispatched: res.notification_dispatched,
        trace_ids: res.trace_ids,
        total_latency_ms: res.total_latency_ms,
        received_at: new Date().toISOString(),
        read: false,
      })

      toast({
        type: res.urgency === 'high' ? 'error' : res.urgency === 'medium' ? 'warning' : 'info',
        title: `Post analyzed — ${res.urgency} urgency`,
        message: res.insight,
        duration: 6000,
      })
    } catch (err: unknown) {
      cancelled = true
      timers.forEach(clearTimeout)
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      const kind = !(err instanceof ApiError) || err.status === 0 ? 'network' : 'server'
      setError(errMsg)
      setErrorKind(kind)
      setStep('result')
      setAgentProgress((prev) => {
        const next = { ...prev }
        agentIds.forEach((id) => {
          if (next[id] === 'running' || next[id] === 'pending') next[id] = 'error'
        })
        return next
      })
      toast({ type: 'error', title: 'Analysis failed', message: errMsg })
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-100">Analyze Post</h1>
        <p className="text-sm text-gray-500 mt-1">
          Run the full 4-agent pipeline: monitor → analyze → insight → notify.
        </p>
      </div>

      {/* Creator selector */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Creator</p>
        <div className="flex flex-col gap-2">
          {DEMO_CREATORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCreator(c)}
              className={cn(
                'flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.99]',
                selectedCreator.id === c.id
                  ? 'bg-brand-500/15 border-brand-500/40 text-gray-100'
                  : 'bg-white/3 border-white/8 text-gray-400 hover:border-white/15',
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                'bg-gradient-to-br from-brand-400 to-brand-700 text-white',
              )}>
                {c.handle.slice(1, 3).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.handle}</p>
                <p className="text-xs text-gray-500">
                  {profiles[c.id]
                    ? `${formatNumber(profiles[c.id].follower_count)} followers`
                    : c.authorized
                    ? 'Loading…'
                    : '—'}
                </p>
              </div>
              {!c.authorized && (
                <span className="text-xs text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                  Needs auth
                </span>
              )}
              {selectedCreator.id === c.id && (
                <CheckCircle size={16} className="text-brand-400 shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Video picker — only shown for authorized creators */}
      {selectedCreator.authorized && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Video size={13} className="text-brand-400" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Recent Videos
            </p>
            {videosLoading && <Spinner size="sm" />}
          </div>
          {!videosLoading && videosError === 'unreachable' && (
            <ServerUnreachable
              message="Could not load videos — check that the backend is running."
              onRetry={() => doFetchVideos(selectedCreator.id, () => false)}
            />
          )}
          {!videosLoading && videosError === 'auth' && (
            <p className="text-xs text-amber-400">
              TikTok token missing or expired — complete OAuth in Settings.
            </p>
          )}
          {!videosLoading && !videosError && videos.length === 0 && (
            <p className="text-xs text-gray-500">No videos found for this creator.</p>
          )}
          {videos.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
              {videos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVideo(v)}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-xl border p-2.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.99]',
                    selectedVideo?.id === v.id
                      ? 'bg-brand-500/15 border-brand-500/40'
                      : 'bg-white/3 border-white/5 hover:border-white/15',
                  )}
                >
                  {v.cover_image_url && (
                    <img
                      src={v.cover_image_url}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0 bg-white/5"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 truncate">
                      {v.video_description || '(no caption)'}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-0.5 tabular-nums">
                      {formatNumber(v.view_count)} views · {formatNumber(v.like_count)} likes
                    </p>
                  </div>
                  {selectedVideo?.id === v.id && (
                    <CheckCircle size={14} className="text-brand-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Post stats preview */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          {selectedVideo ? 'Live Post Stats' : 'Simulated Post Stats'}
        </p>
        {(() => {
          const src = selectedVideo
            ? { views: selectedVideo.view_count, likes: selectedVideo.like_count, comments: selectedVideo.comment_count, shares: selectedVideo.share_count, retention_pct: selectedVideo.retention_pct }
            : DEMO_ANALYZE_REQUEST.current_stats
          return (
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <StatTile label="Views" value={src.views} pct={false} />
                <StatTile label="Likes" value={src.likes} pct={false} />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <StatTile label="Comments" value={src.comments}      pct={false} />
                <StatTile label="Shares"   value={src.shares}        pct={false} />
                <StatTile label="Ret. %"   value={src.retention_pct} pct={true}  />
              </div>
            </div>
          )
        })()}
        {selectedVideo && (
          <p className="text-[10px] text-gray-600 mt-2 leading-snug">
            ret. % estimated from engagement signals
          </p>
        )}
      </div>

      {/* Run button — sticky above bottom nav so it never overlaps content */}
      {step === 'form' && (
        <div
          className="sticky z-40 px-0"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={runAnalysis}
            className="btn-primary w-full flex min-h-14 items-center justify-center gap-2 text-base shadow-2xl focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.99]"
          >
            <Play size={18} />
            Run pipeline
          </button>
        </div>
      )}

      {/* Agent progress */}
      <AnimatePresence>
        {(step === 'running' || (step === 'result' && Object.keys(agentProgress).length > 0)) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-2"
          >
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Pipeline execution
            </p>
            {AGENT_STEPS.map((s) => (
              <AgentStepRow
                key={s.id}
                step={s}
                status={agentProgress[s.id] ?? 'pending'}
                traceId={result?.trace_ids[s.id]}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result card */}
      <AnimatePresence>
        {step === 'result' && result && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            {/* Signal + Urgency */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className={cn('badge border px-2.5 py-1 text-xs font-medium', signalBg(result.signal as import('@/api/types').Signal))}>
                  {signalLabel(result.signal as import('@/api/types').Signal)}
                </span>
                <span className={cn('badge border px-2.5 py-1 text-xs font-medium', urgencyBg(result.urgency))}>
                  {result.urgency} urgency
                </span>
                {result.notification_dispatched && (
                  <Badge variant="success"><Zap size={10} /> Notified</Badge>
                )}
              </div>

              <p className="text-base text-gray-100 leading-relaxed font-medium">{result.insight}</p>

              {result.recommended_action && (
                <div className="mt-4 p-3 bg-brand-500/10 border border-brand-500/25 rounded-xl">
                  <p className="text-xs text-brand-300 font-semibold mb-1">AI Recommendation</p>
                  <p className="text-sm text-gray-200">{result.recommended_action}</p>
                </div>
              )}
            </div>

            {/* T+60 Forecast */}
            {result.forecast_context && (
              <ForecastCard
                forecastContext={result.forecast_context}
                currentStats={lastStats ?? {}}
              />
            )}

            {/* Z-score radar + bars */}
            <div className="card p-5 grid sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Performance profile
                </p>
                <ZScoreRadar zScores={result.z_scores} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  vs. Baseline
                </p>
                <ZScorePanel zScores={result.z_scores} className="mt-4" />
              </div>
            </div>

            {/* Trace */}
            <button
              onClick={() => setShowTrace((t) => !t)}
              className="-ml-2 flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"
            >
              <ChevronDown size={14} className={cn('transition-transform', showTrace && 'rotate-180')} />
              Trace · {result.total_latency_ms.toFixed(0)}ms total
            </button>
            {showTrace && (
              <div className="card p-4 font-mono text-xs text-gray-400 space-y-1">
                {Object.entries(result.trace_ids).map(([agent, id]) => (
                  <div key={agent} className="flex gap-3">
                    <span className="text-gray-600 w-36 shrink-0">{agent}</span>
                    <span>{id}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Run again */}
            <button
              onClick={() => { setStep('form'); setResult(null); setLastStats(null); setAgentProgress({}) }}
              className="btn-ghost flex min-h-11 items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"
            >
              <RefreshCw size={14} />
              Run again
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      {step === 'result' && error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card p-5 border-red-500/25 bg-red-500/8"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-red-400" />
            <p className="text-sm font-medium text-red-300">
              {errorKind === 'network' ? 'Server unreachable' : 'Pipeline failed'}
            </p>
          </div>
          <p className="text-xs text-red-400/80 font-mono">{error}</p>
          <button
            onClick={() => { setStep('form'); setError(null); setErrorKind(null); setAgentProgress({}) }}
            className="btn-ghost mt-3 min-h-11 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"
          >
            Try again
          </button>
        </motion.div>
      )}
    </div>
  )
}
