import { cn } from '@/lib/utils'
import { zScoreBar, zScoreLabel } from '@/lib/utils'

interface ZScoreRowProps {
  label: string
  z: number | null | undefined
  className?: string
}

export function ZScoreRow({ label, z, className }: ZScoreRowProps) {
  const { width, color } = zScoreBar(z ?? 0)
  const isSignificant = z != null && Math.abs(z) >= 1.5

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="w-20 text-xs text-gray-500 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width, backgroundColor: color }}
        />
      </div>
      <span className={cn(
        'w-14 text-xs font-mono text-right tabular-nums shrink-0',
        isSignificant
          ? (z! > 0 ? 'text-green-400' : 'text-red-400')
          : 'text-gray-400'
      )}>
        {zScoreLabel(z)}
      </span>
    </div>
  )
}

interface ZScorePanelProps {
  zScores: Partial<Record<string, number | null>>
  className?: string
}

export const STAT_LABELS: Record<string, string> = {
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  retention_pct: 'Retention',
}

export function ZScorePanel({ zScores, className }: ZScorePanelProps) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {Object.entries(STAT_LABELS).map(([key, label]) => (
        <ZScoreRow key={key} label={label} z={zScores[key]} />
      ))}
    </div>
  )
}
