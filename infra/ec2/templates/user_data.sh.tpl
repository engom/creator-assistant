#!/bin/bash
# cloud-init bootstrap for Pub-IQ API
# Runs once on first boot. All secrets come from SSM Parameter Store.
# SSH is disabled — use SSM Session Manager for admin access.
set -euo pipefail
exec > >(tee /var/log/pubiq-init.log | logger -t pubiq-init) 2>&1
echo "=== Pub-IQ boot: $(date -u) ==="

# ---------------------------------------------------------------------------
# 1. System packages
# ---------------------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg lsb-release unzip \
    nginx certbot python3-certbot-dns-route53 \
    git

# AWS CLI v2 — not in Ubuntu 24.04 apt repos, install official arm64 binary
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp/awscliv2
/tmp/awscliv2/aws/install
rm -rf /tmp/awscliv2 /tmp/awscliv2.zip

# ---------------------------------------------------------------------------
# 2. Docker CE + Compose plugin (arm64)
# ---------------------------------------------------------------------------
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

# ---------------------------------------------------------------------------
# 3. Clone source — this brings docker/, pyproject.toml, uv.lock, app/ etc.
# ---------------------------------------------------------------------------
APP_DIR=/opt/pubiq
git clone "${app_repo}" "$APP_DIR"

# ---------------------------------------------------------------------------
# 4. Pull secrets from SSM Parameter Store into .env
# ---------------------------------------------------------------------------
get_ssm() {
    aws ssm get-parameter --region "${aws_region}" \
        --name "$1" --with-decryption --query Parameter.Value --output text
}

POSTGRES_USER=$(get_ssm /pubiq/POSTGRES_USER)
POSTGRES_PASSWORD=$(get_ssm /pubiq/POSTGRES_PASSWORD)
POSTGRES_DB=$(get_ssm /pubiq/POSTGRES_DB)
TIKTOK_CLIENT_ID=$(get_ssm /pubiq/TIKTOK_CLIENT_ID)
TIKTOK_CLIENT_SECRET=$(get_ssm /pubiq/TIKTOK_CLIENT_SECRET)
TIKTOK_REDIRECT_URI=$(get_ssm /pubiq/TIKTOK_REDIRECT_URI)
JWT_SECRET=$(get_ssm /pubiq/JWT_SECRET)
API_KEYS=$(get_ssm /pubiq/API_KEYS)
CORS_ORIGINS=$(get_ssm /pubiq/CORS_ORIGINS)
# ANTHROPIC_API_KEY intentionally omitted — LLM_MODEL=bedrock/* uses the EC2
# instance role for inference; no API key is needed.

# .env lives at the repo root, next to pyproject.toml — docker-compose.yml
# references it as env_file: .env (resolved relative to --project-directory).
# Quoted delimiter ('ENV') prevents bash from expanding $ in secret values,
# which would silently corrupt passwords that contain $ characters.
cat > "$APP_DIR/.env" <<'ENV_TEMPLATE'
POSTGRES_USER=__POSTGRES_USER__
POSTGRES_PASSWORD=__POSTGRES_PASSWORD__
POSTGRES_DB=__POSTGRES_DB__
TIKTOK_CLIENT_ID=__TIKTOK_CLIENT_ID__
TIKTOK_CLIENT_SECRET=__TIKTOK_CLIENT_SECRET__
TIKTOK_REDIRECT_URI=__TIKTOK_REDIRECT_URI__
JWT_SECRET=__JWT_SECRET__
API_KEYS=__API_KEYS__
CORS_ORIGINS=__CORS_ORIGINS__
LLM_MODEL=${llm_model}
DATABASE_URL=postgresql://__POSTGRES_USER__:__POSTGRES_PASSWORD__@postgres:5432/__POSTGRES_DB__
DBOS_SYSTEM_DATABASE_URL=postgresql://__POSTGRES_USER__:__POSTGRES_PASSWORD__@postgres:5432/__POSTGRES_DB__
ENV_TEMPLATE
sed -i \
  -e "s|__POSTGRES_USER__|$POSTGRES_USER|g" \
  -e "s|__POSTGRES_PASSWORD__|$POSTGRES_PASSWORD|g" \
  -e "s|__POSTGRES_DB__|$POSTGRES_DB|g" \
  -e "s|__TIKTOK_CLIENT_ID__|$TIKTOK_CLIENT_ID|g" \
  -e "s|__TIKTOK_CLIENT_SECRET__|$TIKTOK_CLIENT_SECRET|g" \
  -e "s|__TIKTOK_REDIRECT_URI__|$TIKTOK_REDIRECT_URI|g" \
  -e "s|__JWT_SECRET__|$JWT_SECRET|g" \
  -e "s|__API_KEYS__|$API_KEYS|g" \
  -e "s|__CORS_ORIGINS__|$CORS_ORIGINS|g" \
  "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# ---------------------------------------------------------------------------
# 5. systemd unit — clone provides docker/pubiq.service; install it
# ---------------------------------------------------------------------------
cp "$APP_DIR/docker/pubiq.service" /etc/systemd/system/pubiq.service
systemctl daemon-reload
systemctl enable pubiq

# ---------------------------------------------------------------------------
# 6. Nginx — write a minimal HTTP stub so nginx starts cleanly before certs
# exist, then swap in the real TLS vhost after certbot completes.
# ---------------------------------------------------------------------------
NGINX_CONF=/etc/nginx/sites-available/pubiq-api
rm -f /etc/nginx/sites-enabled/default

# Stub: plain HTTP, no TLS directives. nginx -t passes without cert files.
cat > "$NGINX_CONF" <<STUB
server {
    listen 80;
    server_name api.${domain};
    return 503;
}
STUB
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/pubiq-api
nginx -t
systemctl enable --now nginx

# ---------------------------------------------------------------------------
# 7. TLS certificate via certbot DNS-01 (Route53 plugin)
# IAM role grants ssm + route53 access; certbot can complete the DNS challenge
# before the box is publicly reachable, so no port-80 listener is needed.
# ---------------------------------------------------------------------------
certbot certonly \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email \
    --dns-route53 \
    --dns-route53-propagation-seconds 30 \
    -d "api.${domain}"

# Replace stub with the real TLS vhost now that certs exist.
sed "s|api\\.yourdomain\\.com|api.${domain}|g" \
    "$APP_DIR/docker/pubiq-api.conf" > "$NGINX_CONF"
nginx -t
systemctl reload nginx

# ---------------------------------------------------------------------------
# 8. Cert auto-renewal (3am daily, reload Nginx on success)
# ---------------------------------------------------------------------------
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

# ---------------------------------------------------------------------------
# 9. Build images, apply schema, start the full stack
# ---------------------------------------------------------------------------
COMPOSE="docker compose --project-directory $APP_DIR -f docker/docker-compose.yml"

cd "$APP_DIR"
$COMPOSE build

# Bring Postgres up first and wait for it to be ready.
$COMPOSE up -d postgres
echo "  waiting for postgres..."
until $COMPOSE exec -T postgres pg_isready -U "$POSTGRES_USER" > /dev/null 2>&1; do
    sleep 0.5
done

# Apply schema (idempotent — all DDL uses IF NOT EXISTS).
$COMPOSE exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    < "$APP_DIR/app/omicron_agent_kit/db/schema.sql"
echo "  schema applied"

# Start the full stack (api depends_on postgres healthy — already satisfied).
# Use docker compose directly rather than systemctl to avoid cloud-init timeout;
# systemd takes over on subsequent reboots via the enabled pubiq.service.
$COMPOSE up -d
echo "  stack started"

echo "=== Pub-IQ boot complete: $(date -u) ==="
