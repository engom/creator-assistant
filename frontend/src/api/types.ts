// All types mirroring the backend API schemas exactly

export type Platform = 'tiktok' | 'instagram' | 'youtube'
export type Signal = 'above_baseline' | 'within_baseline' | 'below_baseline' | 'insufficient_data'
export type Urgency = 'low' | 'medium' | 'high'

export interface CurrentStats {
  views: number
  likes: number
  comments: number
  shares: number
  retention_pct: number
}

export interface HistoricalBaseline {
  avg_views: number
  std_views: number
  avg_likes: number
  std_likes: number
  avg_comments: number
  std_comments: number
  avg_shares: number
  std_shares: number
  avg_retention_pct: number
  std_retention_pct: number
  sample_size: number
}

export interface ZScores {
  views: number
  likes: number
  comments: number
  shares: number
  retention_pct: number
  [key: string]: number | null | undefined
}

// POST /v1/pipeline/analyze-post
export interface AnalyzePostRequest {
  creator_id: string
  post_id: string
  platform?: Platform
  detected_at: string
  current_stats: CurrentStats
  historical_baseline: HistoricalBaseline
}

export interface AnalyzePostResponse {
  creator_id: string
  post_id: string
  platform: string
  poll_offsets_min: number[]
  z_scores: ZScores
  signal: Signal
  insight: string
  urgency: Urgency
  recommended_action: string
  notification_dispatched: boolean
  trace_ids: Record<string, string>
  total_latency_ms: number
}

// GET /health
export interface HealthResponse {
  status: 'ok' | 'degraded'
  lm_error?: string
}

// GET /v1/agents
export interface AgentInfo {
  name: string
  description: string
}

// POST /v1/workflows/pubiq
export interface PubIQRequest {
  creator_id: string
  post_id: string
  platform?: Platform
}

export interface PubIQResponse {
  status: string
  workflow_id: string
  creator_id: string
  post_id: string
  platform: string
  checkpoints: number[]
}

// POST /v1/agents/{name}/invoke
export interface AgentInvokeRequest {
  input: Record<string, unknown>
}

export interface AgentInvokeResponse {
  agent: string
  output: Record<string, unknown>
  latency_ms: number
  trace_id: string
}

// Frontend-only: enriched notification model for demo
export interface Notification {
  id: string
  creator_id: string
  post_id: string
  platform: Platform
  urgency: Urgency
  signal: Signal
  insight: string
  recommended_action: string
  z_scores: ZScores
  current_stats: CurrentStats
  notification_dispatched: boolean
  trace_ids: Record<string, string>
  total_latency_ms: number
  received_at: string // ISO
  read: boolean
  approved?: boolean
}

// Frontend-only: creator profile for demo
export interface CreatorProfile {
  id: string
  handle: string
  platform: Platform
  avatar_url?: string
  followers: number
  baseline: HistoricalBaseline
  authorized: boolean
}
