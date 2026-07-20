import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAppStore, store } from '@/store/app'
import { api } from '@/api/client'

export function HealthBadge() {
  const status = useAppStore((s) => s.healthStatus)
  const lmError = useAppStore((s) => s.lmError)

  useEffect(() => {
    async function check() {
      try {
        const h = await api.health()
        store.setHealth(h.status, h.lm_error)
      } catch {
        store.setHealth('degraded', undefined)
      }
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (status === 'unknown') return null

  if (status === 'ok') {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
        style={{
          background: 'rgba(0,212,170,0.08)',
          borderColor: 'rgba(0,212,170,0.2)',
          color: '#00d4aa',
        }}
        title="System healthy"
      >
        <span className="live-dot" style={{ width: 5, height: 5 }} />
        <span>Live</span>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-amber-500/10 border-amber-500/20 text-amber-400"
      title={lmError ?? 'API unreachable'}
    >
      <AlertTriangle size={11} />
      <span>Degraded</span>
    </div>
  )
}
