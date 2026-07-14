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
      avg_shares: 120,  std_shares: 38,
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
      avg_shares: 62,   std_shares: 22,
      avg_retention_pct: 28.0, std_retention_pct: 4.2,
      sample_size: 10,
    },
  },
]

let _notifId = 1
function nid() { return `notif_${_notifId++}` }

export const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: nid(),
    creator_id: 'elpanthio',
    post_id: 'vid_9kQm3x',
    post_title: 'PSG Champion d\'Europe ⭐⭐ #psg #championsleague',
    platform: 'tiktok',
    urgency: 'high',
    signal: 'above_baseline',
    insight: 'Your engagement rate at T+45 is 3.1× your 30-day average — views velocity is exceptional.',
    recommended_action: 'Cross-post to Instagram Reels — awaiting your approval.',
    z_scores: { views: 3.1, likes: 2.7, comments: 2.4, shares: 3.8, retention_pct: 1.9 },
    current_stats: { views: 76000, likes: 5800, comments: 430, shares: 870, retention_pct: 48.2 },
    notification_dispatched: true,
    trace_ids: {
      'monitoring-agent': 'tr-01',
      'analytics-agent':  'tr-02',
      'insight-agent':    'tr-03',
      'notification-agent': 'tr-04',
    },
    total_latency_ms: 1240,
    received_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: nid(),
    creator_id: 'elpanthio',
    post_id: 'vid_2pLt7s',
    post_title: 'Réaction finale Champions League 🔥 #reaction',
    platform: 'tiktok',
    urgency: 'medium',
    signal: 'above_baseline',
    insight: 'Comments at T+30 are 1.8× your 30-day average — strong early conversation.',
    recommended_action: 'Reply to top 3 comments to boost algorithmic reach.',
    z_scores: { views: 1.2, likes: 1.5, comments: 1.8, shares: 0.9, retention_pct: 1.1 },
    current_stats: { views: 24500, likes: 1780, comments: 168, shares: 82, retention_pct: 31.5 },
    notification_dispatched: true,
    trace_ids: {
      'monitoring-agent': 'tr-05',
      'analytics-agent':  'tr-06',
      'insight-agent':    'tr-07',
      'notification-agent': 'tr-08',
    },
    total_latency_ms: 980,
    received_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: nid(),
    creator_id: 'elpanthio',
    post_id: 'vid_7nBq9a',
    post_title: 'Mon avis honnête sur cette tendance 👀',
    platform: 'tiktok',
    urgency: 'high',
    signal: 'below_baseline',
    insight: 'Retention at T+60 is 0.6× your 30-day average — viewers are dropping off early.',
    recommended_action: 'Review your hook (first 2s) — consider a follow-up stitch with a stronger opener.',
    z_scores: { views: -1.6, likes: -1.2, comments: -0.8, shares: -1.9, retention_pct: -2.1 },
    current_stats: { views: 19000, likes: 1100, comments: 88, shares: 34, retention_pct: 19.8 },
    notification_dispatched: true,
    trace_ids: {
      'monitoring-agent': 'tr-09',
      'analytics-agent':  'tr-10',
      'insight-agent':    'tr-11',
      'notification-agent': 'tr-12',
    },
    total_latency_ms: 1105,
    received_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: true,
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
