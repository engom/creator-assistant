# Testing the Pub-IQ Monitoring Workflow

End-to-end test using real TikTok data from `@elpanthio`.

## Prerequisites

- Postgres running (`docker ps` should show `omicron-pg`)
- Server running (`make serve`)
- `@elpanthio` authorized (token in `oauth_tokens` table — see `docs/tiktok-oauth-local-setup.md`)
- cloudflared tunnel active if you need to re-authorize

---

## Step 1 — List real videos from the TikTok API

Grab the access token from Postgres and hit the video list endpoint directly:

```bash
ACCESS_TOKEN=$(docker exec omicron-pg psql -U postgres -d omicron -t -c \
  "SELECT access_token FROM oauth_tokens WHERE creator_id = 'elpanthio';" | xargs)

curl -s -X POST "https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,view_count,like_count,comment_count,share_count,title" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"max_count": 5}' | python3 -m json.tool
```

Pick a video `id` from the response. The most recent video is the best candidate.

**Example output (2026-07-12):**
```json
{
  "id": "7645800090132598049",
  "title": "PSG Champion d'Europe...",
  "view_count": 297,
  "like_count": 8,
  "comment_count": 0,
  "share_count": 0,
  "create_time": 1780176560
}
```

---

## Step 2 — Trigger the Pub-IQ workflow

```bash
curl -s -X POST http://localhost:8000/v1/workflows/pubiq \
  -H "Content-Type: application/json" \
  -H "X-API-Key: omicron-agent-kit-cac40-key-omicron-07-2026:dev-key-change-me" \
  -d '{
    "creator_id": "elpanthio",
    "post_id": "7645800090132598049",
    "platform": "tiktok"
  }' | python3 -m json.tool
```

Expected response:
```json
{
  "status": "started",
  "workflow_id": "9a31f85a-7c69-41d4-b79b-1ef145b95670",
  "creator_id": "elpanthio",
  "post_id": "7645800090132598049",
  "platform": "tiktok",
  "checkpoints": [30, 60, 90]
}
```

---

## Step 3 — Verify DBOS picked it up

```bash
docker exec omicron-pg psql -U postgres -d omicron_dbos_sys -c "
SELECT workflow_uuid, status, name
FROM dbos.workflow_status
WHERE name = 'pubiq_workflow'
ORDER BY created_at DESC
LIMIT 5;"
```

Expected: `status = PENDING` (sleeping until T+30).

---

## Step 4 — Watch step progress

```bash
docker exec omicron-pg psql -U postgres -d omicron_dbos_sys -c "
SELECT function_name, output, error
FROM dbos.operation_outputs
WHERE workflow_uuid = 'YOUR_WORKFLOW_ID'
ORDER BY function_id;"
```

After T+30 min you'll see `fetch_metrics`, `load_baseline`, `persist_checkpoint` appear.

---

## Step 5 — Check stored checkpoint data

```bash
docker exec omicron-pg psql -U postgres -d omicron -c "
SELECT post_id, offset_min, views, likes, comments, shares, signal, fetched_at
FROM post_checkpoints
WHERE creator_id = 'elpanthio'
ORDER BY fetched_at DESC;"
```

---

## Step 6 — Check baseline (seeded after all 3 checkpoints)

```bash
docker exec omicron-pg psql -U postgres -d omicron -c "
SELECT stat_name, count, round(mean::numeric, 1) as mean, round(sqrt(m2/count)::numeric, 1) as std
FROM creator_baselines
WHERE creator_id = 'elpanthio'
ORDER BY stat_name;"
```

---

## What to expect on first run

The first monitored video seeds the baseline — no alert fires because `sample_size < 8`.
The second video monitored will have baseline data and can trigger alerts.

| Checkpoint | Behavior |
|---|---|
| T+30 | Fetch stats, `signal = insufficient_data`, store checkpoint, no alert |
| T+60 | Same |
| T+90 | Same, then Welford-update baseline with this video's stats |

Once you have 8+ videos monitored, alerts fire when `abs(z_score) >= 1.5` on `view_count`.

---

## Quickfire re-test (skip the 30-min wait)

To test the full pipeline synchronously without waiting, use the pipeline endpoint directly with mock stats:

```bash
curl -s -X POST http://localhost:8000/v1/pipeline/analyze-post \
  -H "Content-Type: application/json" \
  -H "X-API-Key: omicron-agent-kit-cac40-key-omicron-07-2026:dev-key-change-me" \
  -d '{
    "creator_id": "elpanthio",
    "post_id": "7645800090132598049",
    "platform": "tiktok",
    "detected_at": "2026-07-12T00:00:00Z",
    "current_stats": {"views": 2084, "likes": 79, "comments": 5, "shares": 1, "retention_pct": 0.0},
    "historical_baseline": {
      "avg_views": 533.8, "std_views": 680.1,
      "avg_likes": 38.4, "std_likes": 34.4,
      "avg_comments": 1.6, "std_comments": 1.9,
      "avg_shares": 0.8, "std_shares": 1.1,
      "avg_retention_pct": 0.0, "std_retention_pct": 0.0,
      "sample_size": 5
    }
  }' | python3 -m json.tool
```

This uses real stats from `@elpanthio`'s best video (2084 views) vs a manually computed
baseline from 5 videos, and exercises the full 4-agent chain in ~7 seconds.
