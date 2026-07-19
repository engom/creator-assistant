import { motion } from 'framer-motion'
import { ArrowUpRight, Check, ChevronRight, Flame, MessageCircle, Play, Send, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { store, useAppStore } from '@/store/app'
import { cn, formatNumber, timeAgo } from '@/lib/utils'
import type { Notification } from '@/api/types'

function velocityFor(notification: Notification): number | null {
  const nums = Object.values(notification.z_scores).filter((value): value is number => typeof value === 'number')
  if (nums.length === 0) return null
  const best = Math.max(...nums)
  return Math.min(96, Math.max(38, Math.round((best / 4) * 100)))
}

function VelocityRing({ notification }: { notification: Notification }) {
  const value = velocityFor(notification)
  const high = notification.urgency === 'high'
  const circumference = 2 * Math.PI * 44
  const dash = value !== null ? circumference * (value / 100) : 0

  return (
    <div className="relative grid h-40 w-40 shrink-0 place-items-center sm:h-48 sm:w-48">
      <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90" aria-label={value !== null ? `Velocity ${value}%` : 'Velocity unavailable'}>
        <circle cx="56" cy="56" r="44" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="8" />
        {value !== null && (
          <circle
            cx="56" cy="56" r="44" fill="none"
            stroke={high ? '#ff7a45' : '#f9c74f'}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className="drop-shadow-[0_0_9px_rgba(255,122,69,.55)]"
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          {value !== null ? (
            <p className={cn('text-3xl font-semibold tracking-tighter', high ? 'text-orange-300' : 'text-amber-300')}>{value}</p>
          ) : (
            <p className="text-2xl font-semibold tracking-tighter text-gray-600">—</p>
          )}
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-gray-500">velocity</p>
        </div>
      </div>
    </div>
  )
}

export function FeedPage() {
  const notifications = useAppStore((state) => state.notifications)
  const creators = useAppStore((state) => state.creators)
  const [activeCreator, setActiveCreator] = useState<string | null>(null)
  const navigate = useNavigate()

  const available = notifications.filter((item) => activeCreator === null || item.creator_id === activeCreator)
  const pulse = available.find((item) => item.signal === 'above_baseline') ?? available[0]
  const pending = available.filter((item) => item.recommended_action && !item.approved)
  const unread = available.filter((item) => !item.read).length
  const greeting = useMemo(() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  }, [])

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 animate-fade-in pb-4">
      <section className="pt-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-400"><span className="live-dot" /> 15-minute pulse</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-100">{greeting}, creator.</h1>
          </div>
          {unread > 0 && <span className="rounded-full border border-orange-400/25 bg-orange-400/10 px-2.5 py-1 text-xs font-semibold text-orange-300">{unread} need attention</span>}
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <button onClick={() => setActiveCreator(null)} className={cn('min-h-11 shrink-0 rounded-full border px-4 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]', activeCreator === null ? 'border-brand-400/40 bg-brand-500/15 text-brand-200' : 'border-surface-dark-border bg-white/[.03] text-gray-500 hover:text-gray-300')}>
            All accounts
          </button>
          {creators.filter((creator) => creator.authorized).map((creator) => (
            <button
              key={creator.id}
              onClick={() => setActiveCreator(creator.id)}
              className={cn('flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]', activeCreator === creator.id ? 'border-brand-400/40 bg-brand-500/15 text-brand-200' : 'border-surface-dark-border bg-white/[.03] text-gray-500 hover:text-gray-300')}
            >
              <span className="grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-[8px] font-bold text-white">{creator.handle.slice(1, 2).toUpperCase()}</span>
              {creator.handle}
            </button>
          ))}
        </div>
      </section>

      {!pulse && (
        <div className="rounded-[28px] border border-surface-dark-border bg-surface-dark-muted px-6 py-16 text-center">
          <p className="text-sm font-medium text-gray-400">No alerts yet for this account.</p>
          <p className="mt-1 text-xs text-gray-600">Run an analysis in Analyze to generate the first pulse.</p>
          <button onClick={() => navigate('/analyze')} className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-dashed border-surface-dark-rim px-4 text-xs font-medium text-gray-500 transition hover:border-brand-500/40 hover:text-brand-300">
            <Play size={13} /> Analyze a post
          </button>
        </div>
      )}

      {pulse && <>
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[28px] border border-orange-400/20 bg-[radial-gradient(circle_at_20%_0%,rgba(249,115,22,.17),transparent_39%),linear-gradient(135deg,#17131b,#10131e_70%)] p-5 shadow-[0_18px_55px_rgba(0,0,0,.28)]">
        <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-orange-400/10 blur-3xl" />
        <div className="relative flex items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[.14em] text-orange-300"><Flame size={13} /> Trending now</p>
            <h2 className="mt-2 max-w-44 text-xl font-semibold leading-tight text-gray-100">{pulse.signal === 'below_baseline' ? 'The hook is losing viewers.' : 'This post is catching fire.'}</h2>
            <p className="mt-2 text-xs text-gray-500">{timeAgo(pulse.received_at)} · TikTok</p>
          </div>
          <VelocityRing notification={pulse} />
        </div>
        <div className="relative mt-2 grid grid-cols-3 gap-2 border-t border-white/[.07] pt-4">
          {[
            ['Views', formatNumber(pulse.current_stats.views)],
            ['Engagement', pulse.current_stats.views > 0 ? `${((pulse.current_stats.likes + pulse.current_stats.comments + pulse.current_stats.shares) / pulse.current_stats.views * 100).toFixed(1)}%` : '—'],
            ['Retention', `${pulse.current_stats.retention_pct.toFixed(0)}%`],
          ].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/[.045] px-2 py-2.5 text-center"><p className="text-[10px] uppercase tracking-wide text-gray-600">{label}</p><p className="mt-1 font-mono text-sm font-medium text-gray-100">{value}</p></div>)}
        </div>
      </motion.section>

      <section className="rounded-[24px] border border-brand-400/20 bg-brand-500/[.08] p-4">
        <div className="flex gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/20 text-brand-200"><Sparkles size={17} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-brand-300">Creator Sidekick says</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-100">🔥 Views are 3.1× normal. Sentiment is 88% positive. The Champions League reaction is driving the conversation.</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-gray-100">Your next moves</p>
            <p className="mt-0.5 text-xs text-gray-500">Actions that need your approval</p>
          </div>
          <button onClick={() => navigate('/activity')} className="-mr-2 flex min-h-11 items-center gap-0.5 rounded-xl px-3 text-xs font-medium text-brand-300 transition hover:bg-brand-500/10 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]">See all <ChevronRight size={14} /></button>
        </div>
        <div className="flex flex-col gap-3">
          {pending.slice(0, 2).map((notification) => (
            <motion.article key={notification.id} layout className="rounded-2xl border border-surface-dark-border bg-surface-dark-muted p-4">
              <div className="flex items-start gap-3">
                <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', notification.signal === 'above_baseline' ? 'bg-orange-400/15 text-orange-300' : 'bg-red-400/15 text-red-300')}>
                  {notification.signal === 'above_baseline' ? <Send size={17} /> : <MessageCircle size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-gray-100">{notification.signal === 'above_baseline' ? 'Cross-post while it is hot' : 'Rescue the conversation'}</p><span className="text-[10px] text-gray-600">{timeAgo(notification.received_at)}</span></div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-400">{notification.recommended_action}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {notification.signal === 'above_baseline' ? (
                  <button onClick={() => navigate(`/stage/${notification.id}`)} className="btn-primary flex min-h-11 flex-1 items-center justify-center gap-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"><Sparkles size={13} /> Review drafts</button>
                ) : (
                  <button onClick={() => store.approveAction(notification.id)} className="btn-primary flex min-h-11 flex-1 items-center justify-center gap-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"><Check size={13} /> Approve reply plan</button>
                )}
                <button onClick={() => store.markRead(notification.id)} className="grid h-11 w-11 place-items-center rounded-xl border border-surface-dark-border text-xs text-gray-400 transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]" aria-label="Mark action as read"><ArrowUpRight size={15} /></button>
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      <button onClick={() => navigate('/analyze')} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-surface-dark-rim px-4 text-sm font-medium text-gray-400 transition hover:border-brand-500/40 hover:bg-brand-500/[.06] hover:text-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.99]">
        <Play size={15} /> Analyze a new post
      </button>
      </>}
    </div>
  )
}
