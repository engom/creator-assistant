import { useState } from 'react'
import { Key, Eye, EyeOff, CheckCircle, ExternalLink, Shield, AlertTriangle } from 'lucide-react'
import { store } from '@/store/app'
import { useAppStore } from '@/store/app'
import { api } from '@/api/client'
import { toast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { DEMO_CREATORS } from '@/data/demo'

export function SettingsPage() {
  const apiKey = useAppStore((s) => s.apiKey)
  const health = useAppStore((s) => s.healthStatus)
  const lmError = useAppStore((s) => s.lmError)
  const [draftKey, setDraftKey] = useState(apiKey)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)

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
    <div className="flex flex-col gap-6 animate-fade-in max-w-xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-100">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure your Omicron workspace.</p>
      </div>

      {/* API Key */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Key size={14} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">API Key</h2>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="Enter your API key"
              className="w-full bg-white/5 border border-surface-dark-border rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 font-mono focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 pr-9"
            />
            <button
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={saveKey}
            disabled={testing || !draftKey.trim()}
            className="btn-primary px-4 shrink-0"
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
          <span className="text-xs text-gray-500 font-mono">localhost:8000</span>
        </div>
        {lmError && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
            <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">{lmError}</p>
          </div>
        )}
      </div>

      {/* TikTok OAuth */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">🎵</span>
          <h2 className="text-sm font-semibold text-gray-200">TikTok Authorization</h2>
        </div>
        <div className="flex flex-col gap-2">
          {DEMO_CREATORS.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 bg-white/3 rounded-xl border border-white/5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-[10px] font-bold text-white">
                {c.handle.slice(1, 3).toUpperCase()}
              </div>
              <span className="text-sm text-gray-300 flex-1">{c.handle}</span>
              {c.authorized ? (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <CheckCircle size={12} /> Authorized
                </span>
              ) : (
                <a
                  href={api.authorizeTikTok(c.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-all',
                    'bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30',
                  )}
                >
                  Authorize <ExternalLink size={10} />
                </a>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-3">
          Requires <code className="bg-white/5 px-1 rounded text-gray-500">TIKTOK_CLIENT_ID</code> and <code className="bg-white/5 px-1 rounded text-gray-500">TIKTOK_CLIENT_SECRET</code> in backend .env.
        </p>
      </div>

      {/* Backend quick info */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">Quick reference</h2>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
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
