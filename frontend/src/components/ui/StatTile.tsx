import { cn } from '@/lib/utils'

interface StatTileProps {
  label: string
  value: string | number
  sub?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  className?: string
}

export function StatTile({ label, value, sub, trend, trendValue, className }: StatTileProps) {
  return (
    <div className={cn('card p-4 flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-semibold text-gray-100 tabular-nums">{value}</span>
      {(sub || trendValue) && (
        <div className="flex items-center gap-2">
          {trendValue && (
            <span className={cn(
              'text-xs font-medium',
              trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400'
            )}>
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''} {trendValue}
            </span>
          )}
          {sub && <span className="text-xs text-gray-500">{sub}</span>}
        </div>
      )}
    </div>
  )
}
