import { useMemo, useState } from 'react'
import { Key, Eye, EyeOff, CheckCircle, ExternalLink, Shield, AlertTriangle, Copy, Globe2, Terminal, Link2, Check, HelpCircle } from 'lucide-react'
import { store, useAppStore } from '@/store/app'
import { api, BASE } from '@/api/client'
import { toast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { DEMO_CREATORS } from '@/data/demo'

const OAUTH_SCOPES = ['user.info.profile', 'user.info.stats', 'video.list']

function SetupStep({
  number,
  title,
  description,
  done = false,
}: {
  number: number
  title: string
  description: string
  done?: boolean
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/5 bg-white/[.025] p-3">
      <div className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold',
        done ? 'bg-green-500/15 text-green-300' : 'bg-brand-500/15 text-brand-300',
      )}>
        {done ? <Check size={14} /> : number}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-200">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p>
      </div>
    </div>
  )
}

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      toast({ type: 'success', title: 'Copied', message: label, duration: 2400 })
    } catch {
      toast({ type: 'warning', title: 'Copy failed', message: 'Select and copy the value manually.' })
    }
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-gray-600">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-white/8 bg-white/[.04] px-3 text-xs font-semibold text-gray-300 transition hover:bg-white/[.07] hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"
        >
          <Copy size={13} />
          <span className="hidden xs:inline">Copy</span>
        </button>
      </div>
      <p className={cn(
        'break-all text-xs leading-relaxed text-gray-300',
        mono && 'font-mono',
      )}>
        {value}
      </p>
    </div>
  )
}

export function SettingsPage() {
  const apiKey = useAppStore((s) => s.apiKey)
  const health = useAppStore((s) => s.healthStatus)
  const lmError = useAppStore((s) => s.lmError)
  const [draftKey, setDraftKey] = useState(apiKey)
  const [showKey, setShowKey] = useState(false)
  const maskedKey = draftKey.length > 4 ? '••••••••' + draftKey.slice(-4) : '••••••••'
  const [testing, setTesting] = useState(false)
  const [tunnelUrl, setTunnelUrl] = useState('')
  const [selectedCreator, setSelectedCreator] = useState(DEMO_CREATORS[0]?.id ?? 'elpanthio')

  const normalizedTunnelUrl = useMemo(() => tunnelUrl.trim().replace(/\/$/, ''), [tunnelUrl])
  const callbackUrl = normalizedTunnelUrl
    ? `${normalizedTunnelUrl}/auth/tiktok/callback`
    : 'https://<your-tunnel-url>/auth/tiktok/callback'
  const authorizeUrl = normalizedTunnelUrl
    ? `${normalizedTunnelUrl}/auth/tiktok/authorize?creator_id=${encodeURIComponent(selectedCreator)}`
    : `https://<your-tunnel-url>/auth/tiktok/authorize?creator_id=${encodeURIComponent(selectedCreator)}`
  const envLine = `TIKTOK_REDIRECT_URI=${callbackUrl}`

  // Build a per-creator authorize link. Uses the tunnel URL when set, otherwise
  // falls back to the app's relative endpoint. Built per creator_id (never via
  // string replacement) so a creator id that overlaps the tunnel host cannot
  // corrupt the generated URL.
  const buildAuthorizeHref = (creatorId: string) =>
    normalizedTunnelUrl
      ? `${normalizedTunnelUrl}/auth/tiktok/authorize?creator_id=${encodeURIComponent(creatorId)}`
      : api.authorizeTikTok(creatorId)

  async function saveKey() {
    store.setApiKey(draftKey.trim())
    setTesting(true)
    try {
      const h = await api.health()
      store.setHealth(h.status, h.lm_error)
      toast({
        type: h.status === 'ok' ? 'success' : 'warning',
        title: h.status === 'ok' ? 'Connected' : 'Degraded',
        message: h.lm_error ?? 'API key saved.',
      })
    } catch (err) {
      store.setHealth('degraded', String(err))
      toast({ type: 'error', title: 'Connection failed', message: String(err) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 animate-fade-in max-w-xl pb-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-100">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure your PubIQ workspace.</p>
      </div>

      {/* API Key */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Key size={14} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">API Key</h2>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            {showKey ? (
              <input
                type="text"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder="Enter your API key"
                className="min-h-11 w-full rounded-xl border border-surface-dark-border bg-white/5 px-3 pr-12 font-mono text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20"
              />
            ) : (
              <div
                className="min-h-11 w-full rounded-xl border border-surface-dark-border bg-white/5 px-3 pr-12 font-mono text-sm text-gray-400 flex items-center cursor-text"
                onClick={() => setShowKey(true)}
              >
                {draftKey ? maskedKey : <span className="text-gray-600">Enter your API key</span>}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-gray-600 transition hover:bg-white/5 hover:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-95"
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={saveKey}
            disabled={testing || !draftKey.trim()}
            className="btn-primary min-h-11 shrink-0 px-5 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"
          >
            {testing ? 'Testing…' : 'Save'}
          </button>
        </div>

        <p className="text-xs text-gray-600 mt-2">
          Set via <code className="bg-white/5 px-1 rounded text-gray-500">API_KEYS</code> env var on the backend. Default: <code className="bg-white/5 px-1 rounded text-gray-500">test-key</code>
        </p>
      </div>

      {/* Connection status */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={14} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-200">Backend status</h2>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={health === 'ok' ? 'success' : health === 'degraded' ? 'warning' : 'muted'}>
            {health}
          </Badge>
          {import.meta.env.DEV && (
            <span className="text-xs text-gray-500 font-mono">{BASE}</span>
          )}
        </div>
        {lmError && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
            <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">{lmError}</p>
          </div>
        )}
      </div>

      {/* TikTok OAuth */}
      <div className="card overflow-hidden">
        <div className="border-b border-white/5 bg-[radial-gradient(circle_at_0%_0%,rgba(124,111,255,.16),transparent_35%),linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.015))] p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/8 text-lg shadow-inner">🎵</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-100">TikTok OAuth setup assistant</h2>
                <Badge variant={health === 'ok' ? 'success' : 'warning'}>
                  {health === 'ok' ? 'backend online' : 'needs backend'}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                Turn the local setup guide into a guided workflow: paste your public tunnel URL once, then copy the exact redirect URI and open the creator authorization link.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <SetupStep
              number={1}
              title="Start tunnel"
              description="Run cloudflared locally so TikTok can call back to your API over HTTPS."
              done={Boolean(normalizedTunnelUrl)}
            />
            <SetupStep
              number={2}
              title="Register callback"
              description="Copy the generated callback URL into Login Kit → Redirect URI, then apply changes."
              done={Boolean(normalizedTunnelUrl)}
            />
            <SetupStep
              number={3}
              title="Authorize creator"
              description="Open the generated authorization URL and approve from the creator's TikTok account."
            />
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[.06] p-4">
            <div className="flex gap-3">
              <HelpCircle size={16} className="mt-0.5 shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-amber-200">One TikTok console step still cannot be automated locally</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
                  TikTok requires you to add the HTTPS callback URL in the developer console and include the creator under Sandbox target users. PubIQ now gives you the exact values and links so users do not have to read the setup markdown.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-gray-500">
                <Globe2 size={13} className="text-brand-400" /> Cloudflare tunnel URL
              </span>
              <input
                value={tunnelUrl}
                onChange={(e) => setTunnelUrl(e.target.value)}
                placeholder="https://your-tunnel.trycloudflare.com"
                className="min-h-11 w-full rounded-xl border border-surface-dark-border bg-white/5 px-3 font-mono text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>

            <CopyField label="Run tunnel command" value="cloudflared tunnel --url http://localhost:8000" />
            <CopyField label="Backend .env redirect setting" value={envLine} />
            <CopyField label="TikTok Login Kit redirect URI" value={callbackUrl} />
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[.025] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Terminal size={14} className="text-brand-400" />
              <h3 className="text-sm font-semibold text-gray-200">TikTok console checklist</h3>
            </div>
            <div className="space-y-2 text-xs leading-relaxed text-gray-500">
              <p><span className="text-gray-300">Products:</span> add <span className="font-semibold text-gray-300">Login Kit</span> in Sandbox.</p>
              <p><span className="text-gray-300">Redirect URI:</span> paste the generated callback URL above.</p>
              <p><span className="text-gray-300">Scopes:</span> {OAUTH_SCOPES.map((scope) => <code key={scope} className="mx-0.5 rounded bg-white/5 px-1 text-gray-400">{scope}</code>)}</p>
              <p><span className="text-gray-300">Target users:</span> add the creator username you want to authorize, then click <span className="font-semibold text-gray-300">Apply changes</span>.</p>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-200">Authorize a creator</h3>
                <p className="mt-0.5 text-xs text-gray-600">Choose a creator, then open the exact OAuth URL.</p>
              </div>
              <select
                value={selectedCreator}
                onChange={(e) => setSelectedCreator(e.target.value)}
                className="min-h-11 rounded-xl border border-surface-dark-border bg-[#0f1420] px-3 text-xs font-medium text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
              >
                {DEMO_CREATORS.map((c) => <option key={c.id} value={c.id}>{c.handle}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-3">
              {DEMO_CREATORS.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[.025] p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-[10px] font-bold text-white">
                    {c.handle.slice(1, 3).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-300">{c.handle}</p>
                    <p className="text-[11px] text-gray-600">creator_id: {c.id}</p>
                  </div>
                  {c.authorized ? (
                    <span className="flex min-h-11 items-center gap-1 rounded-xl border border-green-500/20 bg-green-500/10 px-3 text-xs font-semibold text-green-300">
                      <CheckCircle size={13} /> Authorized
                    </span>
                  ) : (
                    <a
                      href={buildAuthorizeHref(c.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]',
                        'border border-brand-500/30 bg-brand-500/20 text-brand-300 hover:bg-brand-500/30',
                      )}
                    >
                      Authorize <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              <CopyField label="Selected creator authorization URL" value={authorizeUrl} />
              <a
                href={buildAuthorizeHref(selectedCreator)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary flex min-h-11 items-center justify-center gap-2 self-end px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"
              >
                <Link2 size={14} />
                Open OAuth
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Backend quick info */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">Quick reference</h2>
        <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
          {[
            ['Health', 'GET /health'],
            ['Agents', 'GET /v1/agents'],
            ['Pipeline', 'POST /v1/pipeline/analyze-post'],
            ['Workflow', 'POST /v1/workflows/pubiq'],
            ['API Docs', 'GET /docs'],
          ].map(([label, path]) => (
            <div key={label} className="flex flex-col gap-0.5 bg-white/3 p-2 rounded-lg">
              <span className="text-gray-600 text-[10px] uppercase tracking-wider">{label}</span>
              <span className="text-gray-400">{path}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
