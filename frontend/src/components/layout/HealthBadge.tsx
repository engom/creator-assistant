import { useEffect } from 'react'
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
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
        store.setHealth('degraded', 'API unreachable')
      }
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (status === 'unknown') return null

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border',
        status === 'ok'
          ? 'bg-green-500/10 border-green-500/20 text-green-400'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      )}
      title={lmError ?? undefined}
    >
      {status === 'ok'
        ? <Wifi size={11} />
        : <AlertTriangle size={11} />
      }
      <span className="hidden sm:inline">{status === 'ok' ? 'Live' : 'Degraded'}</span>
    </div>
  )
}
