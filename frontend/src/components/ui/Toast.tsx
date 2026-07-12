import { useEffect, useState, useCallback, memo } from 'react'
import { cn } from '@/lib/utils'
import { X, Bell, CheckCircle, AlertTriangle, Info } from 'lucide-react'

export type ToastType = 'success' | 'warning' | 'error' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
  action?: { label: string; onClick: () => void }
}

const toastListeners = new Set<(t: ToastItem) => void>()

export function toast(item: Omit<ToastItem, 'id'>) {
  const t: ToastItem = { ...item, id: crypto.randomUUID() }
  toastListeners.forEach((l) => l(t))
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={16} className="text-green-400" />,
  warning: <AlertTriangle size={16} className="text-amber-400" />,
  error: <Bell size={16} className="text-red-400" />,
  info: <Info size={16} className="text-blue-400" />,
}

const bg: Record<ToastType, string> = {
  success: 'border-green-500/25',
  warning: 'border-amber-500/25',
  error: 'border-red-500/25',
  info: 'border-blue-500/25',
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 300)
    }, item.duration ?? 5000)
    return () => clearTimeout(t)
  }, [item.duration, onDismiss])

  return (
    <div className={cn(
      'card border shadow-notification px-4 py-3 flex gap-3 items-start min-w-[300px] max-w-[380px]',
      'transition-all duration-300',
      bg[item.type],
      visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8',
    )}>
      <span className="mt-0.5 shrink-0">{icons[item.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100">{item.title}</p>
        {item.message && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.message}</p>}
        {item.action && (
          <button
            onClick={item.action.onClick}
            className="mt-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
          >
            {item.action.label} →
          </button>
        )}
      </div>
      <button onClick={onDismiss} className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors mt-0.5">
        <X size={14} />
      </button>
    </div>
  )
}

// Memoized wrapper: creates a stable onDismiss bound to the item's id so
// ToastCard's useEffect timer never resets due to a new parent render.
const MemoToastCard = memo(function MemoToastCard({
  item,
  dismiss,
}: {
  item: ToastItem
  dismiss: (id: string) => void
}) {
  const onDismiss = useCallback(() => dismiss(item.id), [item.id, dismiss])
  return <ToastCard item={item} onDismiss={onDismiss} />
})

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const handler = (t: ToastItem) => setToasts((prev) => [...prev, t])
    toastListeners.add(handler)
    return () => { toastListeners.delete(handler) }
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[9999] items-end">
      {toasts.map((t) => (
        // Stable per-toast callback: id never changes, so the closure is stable
        // and ToastCard's useEffect timer won't reset when unrelated toasts arrive.
        <MemoToastCard key={t.id} item={t} dismiss={dismiss} />
      ))}
    </div>
  )
}
