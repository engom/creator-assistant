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
  const isUp   = trend === 'up'
  const isDown = trend === 'down'

  return (
    <div
      className={cn(
        'card p-4 flex flex-col gap-1 transition-all duration-200',
        isUp   && 'border-l-2 border-green-500/40 shadow-[0_0_16px_rgba(34,197,94,0.12)]',
        isDown && 'border-l-2 border-red-500/30',
        className,
      )}
    >
      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-widest leading-none">
        {label}
      </span>
      <span
        className="text-[28px] font-medium text-gray-100 leading-tight"
        style={{ fontFamily: "'DM Mono', monospace", letterSpacing: '-0.03em' }}
      >
        {value}
      </span>
      {(sub || trendValue) && (
        <div className="flex items-center gap-2 mt-0.5">
          {trendValue && (
            <span
              className={cn(
                'text-[12px] font-medium',
                isUp   ? 'text-green-400' :
                isDown ? 'text-red-400' :
                         'text-gray-500',
              )}
            >
              {isUp ? '↑' : isDown ? '↓' : ''}{isUp || isDown ? ' ' : ''}{trendValue}
            </span>
          )}
          {sub && (
            <span className="text-[12px] text-gray-600">{sub}</span>
          )}
        </div>
      )}
    </div>
  )
}
