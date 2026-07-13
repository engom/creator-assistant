import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Zap, CheckCircle, AlertCircle, ChevronDown, RefreshCw, Video } from 'lucide-react'
import { api } from '@/api/client'
import { store } from '@/store/app'
import { toast } from '@/components/ui/Toast'
import { ZScorePanel } from '@/components/ui/ZScoreBar'
import { ZScoreRadar } from '@/components/charts/PerformanceChart'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { cn, signalBg, urgencyBg, formatNumber, formatPercent } from '@/lib/utils'
import type { AnalyzePostResponse, TikTokVideo, TikTokProfile } from '@/api/types'
import { DEMO_CREATORS, DEMO_ANALYZE_REQUEST } from '@/data/demo'
import type { HistoricalBaseline } from '@/api/types'

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
  const [error, setError] = useState<string | null>(null)
  const [selectedCreator, setSelectedCreator] = useState(DEMO_CREATORS[0])
  const [showTrace, setShowTrace] = useState(false)
  const [videos, setVideos] = useState<TikTokVideo[]>([])
  const [videosLoading, setVideosLoading] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState<TikTokVideo | null>(null)
  const [profile, setProfile] = useState<TikTokProfile | null>(null)

  useEffect(() => {
    if (!selectedCreator.authorized) {
      setVideos([])
      setSelectedVideo(null)
      setProfile(null)
      return
    }
    let cancelled = false
    setVideosLoading(true)
    setVideos([])
    setSelectedVideo(null)
    setProfile(null)
    // Reset pipeline state when creator changes
    setStep('form')
    setResult(null)
    setError(null)
    setAgentProgress({})
    Promise.all([
      api.getCreatorProfile(selectedCreator.id).catch(() => null),
      api.listCreatorVideos(selectedCreator.id).catch(() => null),
    ]).then(([prof, vidRes]) => {
      if (cancelled) return
      if (prof) setProfile(prof)
      const vids = vidRes?.videos ?? []
      setVideos(vids)
      if (vids.length > 0) setSelectedVideo(vids[0])
    }).finally(() => {
      if (!cancelled) setVideosLoading(false)
    })
    return () => { cancelled = true }
  }, [selectedCreator.id, selectedCreator.authorized])

  async function runAnalysis() {
    setStep('running')
    setError(null)
    setResult(null)

    // Simulate per-step progress visually (backend runs them sequentially)
    const agentIds = AGENT_STEPS.map((s) => s.id)
    const progress: Record<string, 'pending' | 'running' | 'done' | 'error'> = {}
    agentIds.forEach((id) => { progress[id] = 'pending' })
    setAgentProgress({ ...progress })

    // Animate progress optimistically
    async function tickProgress(idx: number) {
      if (idx >= agentIds.length) return
      progress[agentIds[idx]] = 'running'
      setAgentProgress({ ...progress })
    }

    tickProgress(0)
    const t1 = setTimeout(() => tickProgress(1), 300)
    const t2 = setTimeout(() => tickProgress(2), 800)
    const t3 = setTimeout(() => tickProgress(3), 1400)

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

    try {
      const res = await api.analyzePost(req)

      // Mark all done
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      const done: Record<string, 'done'> = {}
      agentIds.forEach((id) => { done[id] = 'done' })
      setAgentProgress(done)

      setResult(res)
      setStep('result')

      // Push as notification
      store.addNotification({
        id: crypto.randomUUID(),
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
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(errMsg)
      setStep('result')
      // Mark running agents as error
      const errProgress = { ...progress }
      agentIds.forEach((id) => {
        if (errProgress[id] === 'running' || errProgress[id] === 'pending') {
          errProgress[id] = 'error'
        }
      })
      setAgentProgress(errProgress)
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
                  {c.id === selectedCreator.id && profile
                    ? `${formatNumber(profile.follower_count)} followers`
                    : c.id === selectedCreator.id && videosLoading
                    ? 'Loading…'
                    : c.followers > 0
                    ? `${formatNumber(c.followers)} followers`
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
          {!videosLoading && videos.length === 0 && (
            <p className="text-xs text-gray-500">
              No videos found. Token may be missing — complete OAuth in Settings.
            </p>
          )}
          {videos.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
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
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(
            selectedVideo
              ? {
                  views: selectedVideo.view_count,
                  likes: selectedVideo.like_count,
                  comments: selectedVideo.comment_count,
                  shares: selectedVideo.share_count,
                  retention_pct: selectedVideo.retention_pct,
                }
              : DEMO_ANALYZE_REQUEST.current_stats
          ).map(([k, v]) => (
            <div key={k} className="bg-white/3 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-500 capitalize">{k.replace('_pct', ' %')}</p>
              <p className="text-sm font-semibold text-gray-200 tabular-nums mt-0.5">
                {typeof v === 'number' && k.includes('pct') ? formatPercent(v) : formatNumber(v as number)}
              </p>
            </div>
          ))}
        </div>
        {selectedVideo && (
          <p className="text-[10px] text-gray-600 mt-2">
            retention % estimated from engagement signals (likes, comments, shares)
          </p>
        )}
      </div>

      {/* Run button */}
      {step === 'form' && (
        <button
          onClick={runAnalysis}
          className="btn-primary flex min-h-12 items-center justify-center gap-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.99]"
        >
          <Play size={16} />
          Run pipeline
        </button>
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
                  {result.signal.replace(/_/g, ' ')}
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
              onClick={() => { setStep('form'); setResult(null); setAgentProgress({}) }}
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
            <p className="text-sm font-medium text-red-300">Pipeline failed</p>
          </div>
          <p className="text-xs text-red-400/80 font-mono">{error}</p>
          <button
            onClick={() => { setStep('form'); setError(null); setAgentProgress({}) }}
            className="btn-ghost mt-3 min-h-11 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"
          >
            Try again
          </button>
        </motion.div>
      )}
    </div>
  )
}
