import { WifiOff, RefreshCw } from 'lucide-react'

interface ServerUnreachableProps {
  onRetry?: () => void
  message?: string
}

export function ServerUnreachable({ onRetry, message = 'Could not reach the server.' }: ServerUnreachableProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-surface-dark-border bg-surface-dark-muted px-6 py-10 text-center">
      <WifiOff size={28} className="text-gray-600" />
      <div>
        <p className="text-sm font-medium text-gray-300">Server unreachable</p>
        <p className="mt-1 text-xs text-gray-600">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 flex min-h-10 items-center gap-1.5 rounded-xl border border-surface-dark-border px-4 text-xs font-medium text-gray-400 transition hover:bg-white/5 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400/30 active:scale-[0.98]"
        >
          <RefreshCw size={13} />
          Retry
        </button>
      )}
    </div>
  )
}
