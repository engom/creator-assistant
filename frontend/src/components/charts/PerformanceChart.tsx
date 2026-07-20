import { useId } from 'react'
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import type { ZScores } from '@/api/types'
import { cn, formatNumber, formatNumberCompact, formatPercent } from '@/lib/utils'

// ── Radar: z-score profile per stat ──────────────────────────────────────────

interface ZScoreRadarProps {
  zScores: ZScores
  className?: string
}

export function ZScoreRadar({ zScores, className }: ZScoreRadarProps) {
  const data = [
    { stat: 'Views',     z: Math.max(-4, Math.min(4, zScores.views)) },
    { stat: 'Likes',     z: Math.max(-4, Math.min(4, zScores.likes)) },
    { stat: 'Comments',  z: Math.max(-4, Math.min(4, zScores.comments)) },
    { stat: 'Shares',    z: Math.max(-4, Math.min(4, zScores.shares)) },
    { stat: 'Retention', z: Math.max(-4, Math.min(4, zScores.retention_pct)) },
  ]

  const isPositive = data.every((d) => d.z >= 0)
  const color = isPositive ? '#22c55e' : data.some((d) => d.z <= -1.5) ? '#ef4444' : '#3b62f6'

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={200}>
        <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <PolarGrid stroke="#21262e" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="stat"
            tick={{ fill: '#6b7280', fontSize: 11, fontFamily: 'Inter' }}
          />
          <Radar
            dataKey="z"
            stroke={color}
            fill={color}
            fillOpacity={0.15}
            strokeWidth={2}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Area chart: checkpoint timeline ──────────────────────────────────────────

interface CheckpointPoint {
  offset_min: number
  views: number
  likes: number
  shares: number
  baseline_views?: number
}

interface CheckpointChartProps {
  data: CheckpointPoint[]
  className?: string
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-dark-muted border border-surface-dark-border rounded-xl px-3 py-2 shadow-card-hover text-xs">
      <p className="text-gray-400 mb-1.5 font-medium">T+{label} min</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="text-gray-100 font-semibold tabular-nums">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export function CheckpointChart({ data, className }: CheckpointChartProps) {
  const gradId = useId()
  return (
    <div className={cn('w-full', className)} style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b62f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b62f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262e" vertical={false} />
          <XAxis
            dataKey="offset_min"
            tickFormatter={(v) => `T+${v}`}
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'Inter' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'Inter' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatNumberCompact}
            tickCount={3}
            width={44}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#30363d', strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="views"
            name="Views"
            stroke="#3b62f6"
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={{ r: 4, fill: '#3b62f6', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#608bfa' }}
          />
          {data[0]?.baseline_views != null && (
            <Area
              type="monotone"
              dataKey="baseline_views"
              name="Baseline"
              stroke="#30363d"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              fill="none"
              dot={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Sparkline stat bars ───────────────────────────────────────────────────────

interface StatBarProps {
  label: string
  current: number
  baseline: number
  isPct?: boolean
  color?: string
}

export function StatBar({ label, current, baseline, isPct = false, color = '#3b62f6' }: StatBarProps) {
  const isAbove = current > baseline
  const delta = baseline > 0 ? ((current - baseline) / baseline) * 100 : null
  // Bar anchored at baseline = 50%. At-baseline → 50%. 2× baseline → 100%. 0 → 0%.
  const barPct = baseline > 0 ? Math.min(Math.max((current / baseline) * 50, 0), 100) : 50
  const valueLabel = isPct ? formatPercent(current, 1) : formatNumber(current)

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-12 text-gray-500 shrink-0">{label}</span>
      <div className="relative flex-1 h-3 rounded-sm bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-700"
          style={{ width: `${barPct}%`, backgroundColor: isAbove ? '#22c55e' : color, opacity: 0.8 }}
        />
        <div className="absolute top-0 bottom-0 w-px bg-white/30" style={{ left: '50%' }} />
      </div>
      <span className={cn('w-14 text-right tabular-nums font-mono shrink-0', isAbove ? 'text-green-400' : 'text-gray-300')}>
        {valueLabel}
      </span>
      <span className={cn('w-12 text-right tabular-nums shrink-0 text-[10px]', delta === null ? 'text-gray-600' : isAbove ? 'text-green-500' : 'text-gray-500')}>
        {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`}
      </span>
    </div>
  )
}
