-- Omicron Creator Agent — Postgres schema
-- Run once against the target database (or use DBOS auto-migration).

-- Creator rolling baselines (Welford online algorithm state)
CREATE TABLE IF NOT EXISTS creator_baselines (
    creator_id   TEXT NOT NULL,
    platform     TEXT NOT NULL DEFAULT 'tiktok',
    stat_name    TEXT NOT NULL,  -- views, likes, comments, shares, retention_pct
    count        INTEGER NOT NULL DEFAULT 0,
    mean         DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    m2           DOUBLE PRECISION NOT NULL DEFAULT 0.0,  -- sum of (x - mean)^2
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (creator_id, platform, stat_name)
);

-- Per-checkpoint metric snapshots (immutable time-series)
CREATE TABLE IF NOT EXISTS post_checkpoints (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    creator_id   TEXT NOT NULL,
    post_id      TEXT NOT NULL,
    platform     TEXT NOT NULL DEFAULT 'tiktok',
    offset_min   INTEGER NOT NULL,  -- 30, 45, 60, 90
    views        INTEGER NOT NULL DEFAULT 0,
    likes        INTEGER NOT NULL DEFAULT 0,
    comments     INTEGER NOT NULL DEFAULT 0,
    shares       INTEGER NOT NULL DEFAULT 0,
    retention_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    z_scores     JSONB,
    signal       TEXT,
    fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_post
    ON post_checkpoints (creator_id, post_id, offset_min);

-- OAuth tokens (encrypted at rest via Postgres TDE or application-layer encryption)
CREATE TABLE IF NOT EXISTS oauth_tokens (
    creator_id       TEXT NOT NULL,
    platform         TEXT NOT NULL DEFAULT 'tiktok',
    access_token     TEXT NOT NULL,
    refresh_token    TEXT NOT NULL,
    expires_at       TIMESTAMPTZ NOT NULL,
    open_id          TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (creator_id, platform)
);

-- Audit records (replaces file-based audit.log)
CREATE TABLE IF NOT EXISTS audit_records (
    trace_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp         TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenant_id         TEXT NOT NULL,
    agent             TEXT NOT NULL,
    input_hash        TEXT NOT NULL,
    output_hash       TEXT NOT NULL,
    latency_ms        DOUBLE PRECISION NOT NULL,
    model             TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'success',
    retriever_backend TEXT NOT NULL DEFAULT 'n/a'
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time
    ON audit_records (tenant_id, timestamp DESC);
