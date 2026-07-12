import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow } from 'date-fns'
import type { Signal, Urgency } from '@/api/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(isoDate: string): string {
  return formatDistanceToNow(new Date(isoDate), { addSuffix: true })
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function formatPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`
}

export function signalLabel(s: Signal): string {
  const map: Record<Signal, string> = {
    above_baseline: 'Above baseline',
    within_baseline: 'Within baseline',
    below_baseline: 'Below baseline',
    insufficient_data: 'Insufficient data',
  }
  return map[s] ?? s
}

export function signalColor(s: Signal): string {
  const map: Record<Signal, string> = {
    above_baseline: 'text-green-400',
    within_baseline: 'text-blue-400',
    below_baseline: 'text-red-400',
    insufficient_data: 'text-gray-400',
  }
  return map[s] ?? 'text-gray-400'
}

export function signalBg(s: Signal): string {
  const map: Record<Signal, string> = {
    above_baseline: 'bg-green-500/10 border-green-500/20 text-green-400',
    within_baseline: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    below_baseline: 'bg-red-500/10 border-red-500/20 text-red-400',
    insufficient_data: 'bg-gray-500/10 border-gray-500/20 text-gray-400',
  }
  return map[s] ?? 'bg-gray-500/10 border-gray-500/20 text-gray-400'
}

export function urgencyColor(u: Urgency): string {
  const map: Record<Urgency, string> = {
    high:   'text-red-400',
    medium: 'text-amber-400',
    low:    'text-gray-400',
  }
  return map[u] ?? 'text-gray-400'
}

export function urgencyBg(u: Urgency): string {
  const map: Record<Urgency, string> = {
    high:   'bg-red-500/10 border-red-500/25 text-red-400',
    medium: 'bg-amber-500/10 border-amber-500/25 text-amber-400',
    low:    'bg-gray-500/10 border-gray-500/20 text-gray-400',
  }
  return map[u] ?? 'bg-gray-500/10 border-gray-500/20 text-gray-400'
}

export function zScoreBar(z: number): { width: string; color: string } {
  const abs = Math.min(Math.abs(z), 4)
  const width = `${(abs / 4) * 100}%`
  const color = z >= 1.5 ? '#22c55e' : z <= -1.5 ? '#ef4444' : '#3b62f6'
  return { width, color }
}

export function zScoreLabel(z: number | null | undefined): string {
  if (z == null) return 'N/A'
  const sign = z > 0 ? '+' : ''
  return `${sign}${z.toFixed(2)}σ`
}

export function platformIcon(platform: string): string {
  const map: Record<string, string> = {
    tiktok: '🎵',
    instagram: '📸',
    youtube: '▶️',
  }
  return map[platform] ?? '🌐'
}
