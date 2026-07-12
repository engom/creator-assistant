import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted'
  size?: 'sm' | 'md'
  className?: string
}

const variants = {
  default:  'bg-brand-500/10 border-brand-500/25 text-brand-400',
  success:  'bg-green-500/10 border-green-500/25 text-green-400',
  warning:  'bg-amber-500/10 border-amber-500/25 text-amber-400',
  danger:   'bg-red-500/10 border-red-500/25 text-red-400',
  info:     'bg-blue-500/10 border-blue-500/25 text-blue-400',
  muted:    'bg-white/5 border-white/10 text-gray-400',
}

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border font-medium rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
