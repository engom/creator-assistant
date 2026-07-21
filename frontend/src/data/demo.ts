import type { CreatorProfile, Notification } from '@/api/types'

export const DEMO_CREATORS: CreatorProfile[] = [
  {
    id: 'eurafricanews',
    handle: '@eurafricanews',
    platform: 'tiktok',
    followers: 124_000,
    authorized: true,
    baseline: {
      avg_views: 32000, std_views: 9000,
      avg_likes: 2400,  std_likes: 680,
      avg_comments: 180, std_comments: 55,
      avg_shares: 120,  std_shares: 96,
      avg_retention_pct: 31.5, std_retention_pct: 4.8,
      sample_size: 12,
    },
  },
  {
    id: 'elpanthio',
    handle: '@elpanthio',
    platform: 'tiktok',
    followers: 58_000,
    authorized: true,
    baseline: {
      avg_views: 18000, std_views: 5200,
      avg_likes: 1300,  std_likes: 380,
      avg_comments: 95,  std_comments: 30,
      avg_shares: 62,   std_shares: 50,
      avg_retention_pct: 28.0, std_retention_pct: 4.2,
      sample_size: 10,
    },
  },
]

export const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: 'demo-notif-1',
    creator_id: 'eurafricanews',
    post_id: 'vid_demo_fire',
    post_title: '#pourtoi #fuyp — trending video',
    platform: 'tiktok',
    urgency: 'high',
    signal: 'above_baseline',
    insight: 'Retention and shares are both well above your rolling average. The first 3 seconds are driving an unusually long watch time — viewers are completing the video.',
    recommended_action: 'Repost to Instagram Reels within the next 20 minutes to capture the same momentum.',
    z_scores: { views: 2.6, likes: 2.1, comments: 1.4, shares: 3.1, retention_pct: 2.4 },
    current_stats: { views: 55300, likes: 4800, comments: 620, shares: 870, retention_pct: 49 },
    notification_dispatched: true,
    trace_ids: {},
    total_latency_ms: 1240,
    received_at: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
    read: false,
  },
]

export const DEMO_ANALYZE_REQUEST = {
  creator_id: 'elpanthio',
  post_id: `vid_demo_${Math.random().toString(36).slice(2, 8)}`,
  platform: 'tiktok' as const,
  detected_at: new Date().toISOString(),
  current_stats: {
    views: 76000,
    likes: 5800,
    comments: 430,
    shares: 870,
    retention_pct: 48.2,
  },
  historical_baseline: DEMO_CREATORS[0].baseline,
}
