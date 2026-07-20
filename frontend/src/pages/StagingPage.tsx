import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Camera, Check, ChevronLeft, ChevronRight, CirclePlay, Edit3, Send, Sparkles } from 'lucide-react'
import { store, useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'

type Draft = {
  platform: 'Instagram Reel' | 'YouTube Short'
  caption: string
  note: string
  gradient: string
}

function buildDrafts(title: string, action: string): Draft[] {
  return [
    {
      platform: 'Instagram Reel',
      caption: `${title}\n\n${action}\n\n#TikTok #CreatorTips`,
      note: 'Vertical video · Reuse original audio',
      gradient: 'from-[#e83983] via-[#8b5cf6] to-[#3749b6]',
    },
    {
      platform: 'YouTube Short',
      caption: `${title}\n\n${action}\n\n#Shorts #CreatorTips`,
      note: 'Vertical video · Reuse original audio',
      gradient: 'from-[#ff0000] via-[#cc0000] to-[#7f0000]',
    },
  ]
}

export function StagingPage() {
  const { notificationId } = useParams()
  const navigate = useNavigate()
  const notifications = useAppStore((s) => s.notifications)
  const notification = notifications.find((item) => item.id === notificationId) ?? notifications[0]
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    buildDrafts(notification?.post_title || '', notification?.recommended_action || '')
  )
  const [active, setActive] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [pushed, setPushed] = useState(false)

  useEffect(() => {
    setDrafts(buildDrafts(notification?.post_title || '', notification?.recommended_action || ''))
    setActive(0)
    setIsEditing(false)
    setPushed(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification?.id])  // re-seed when navigating to a different notification

  const creators = useAppStore((s) => s.creators)
  const draft = drafts[active]
  const creator = useMemo(
    () => creators.find((c) => c.id === notification?.creator_id)?.handle ?? (notification ? '@' + notification.creator_id : '@creator'),
    [notification, creators],
  )

  function updateCaption(caption: string) {
    setDrafts((current) => current.map((item, index) => index === active ? { ...item, caption } : item))
  }

  function approveAndPush() {
    if (!notification) return
    store.approveAction(notification.id)
    setPushed(true)
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 animate-fade-in pb-4">
      <header className="flex items-center justify-between">
        <Link to="/" className="-ml-2 flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm text-gray-400 transition hover:bg-white/5 hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]">
          <ArrowLeft size={17} /> Pulse
        </Link>
        <span className="text-xs font-medium text-gray-500">Review before publishing</span>
      </header>

      <section>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">
          <Sparkles size={13} /> AI cross-post drafts
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-100">Keep the momentum going.</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          {notification?.insight ?? 'Your latest post is outperforming its early baseline.'}
        </p>
      </section>

      <div className="flex gap-2 rounded-2xl border border-surface-dark-border bg-white/[0.025] p-1.5">
        {drafts.map((item, index) => (
          <button
            key={item.platform}
            onClick={() => { setActive(index); setIsEditing(false) }}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]',
              index === active ? 'bg-white/10 text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-300',
            )}
          >
            {index === 0 ? <Camera size={15} /> : <CirclePlay size={15} />}
            {item.platform.replace(' Reel', '')}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.section
          key={draft.platform}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.18 }}
          className="overflow-hidden rounded-[28px] border border-white/10 bg-surface-dark-muted shadow-2xl"
        >
          <div className={cn('relative h-52 overflow-hidden bg-gradient-to-br p-5', draft.gradient)}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,.25),transparent_28%),linear-gradient(to_top,rgba(0,0,0,.58),transparent_65%)]" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur">{creator.slice(1, 2).toUpperCase()}</span>
                {creator}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/65">Original TikTok</p>
                <p className="mt-1 text-lg font-semibold leading-tight text-white">{notification?.post_title || 'Original TikTok post'}</p>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-100">{draft.platform}</h2>
                <p className="mt-0.5 text-xs text-gray-500">{draft.note}</p>
              </div>
              <button onClick={() => setIsEditing((value) => !value)} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white/5 px-3 text-xs font-medium text-brand-300 transition hover:bg-brand-500/15 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]">
                <Edit3 size={13} /> {isEditing ? 'Done' : 'Edit'}
              </button>
            </div>

            {isEditing ? (
              <textarea
                autoFocus
                value={draft.caption}
                onChange={(event) => updateCaption(event.target.value)}
                className="min-h-44 w-full resize-none rounded-2xl border border-brand-500/35 bg-black/20 p-3 text-sm leading-relaxed text-gray-100 outline-none ring-brand-400/20 focus:ring-2"
                aria-label={`${draft.platform} caption`}
              />
            ) : (
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-300">{draft.caption}</p>
            )}
          </div>
        </motion.section>
      </AnimatePresence>

      <div className="flex items-center justify-between px-1">
        <button disabled={active === 0} onClick={() => setActive((value) => Math.max(0, value - 1))} className="-ml-2 flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs text-gray-500 transition hover:bg-white/5 hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-30">
          <ChevronLeft size={16} /> Previous
        </button>
        <span className="rounded-full bg-white/[0.03] px-3 py-1.5 text-xs font-mono text-gray-600">{active + 1} / {drafts.length}</span>
        <button disabled={active === drafts.length - 1} onClick={() => setActive((value) => Math.min(drafts.length - 1, value + 1))} className="-mr-2 flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs text-gray-400 transition hover:bg-white/5 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-30">
          Next <ChevronRight size={16} />
        </button>
      </div>

      <button
        onClick={approveAndPush}
        disabled={pushed}
        className={cn('btn-primary sticky bottom-24 flex min-h-12 w-full items-center justify-center gap-2 shadow-brand-glow focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.99] sm:bottom-5', pushed && 'bg-green-600 hover:bg-green-600')}
      >
        {pushed ? <><Check size={17} /> Approved for publishing</> : <><Send size={16} /> Approve &amp; push both</>}
      </button>
      {pushed && <button onClick={() => navigate('/')} className="-mt-2 min-h-11 rounded-xl px-3 text-center text-xs text-brand-300 transition hover:bg-brand-500/10 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]">Back to your pulse</button>}
    </div>
  )
}
