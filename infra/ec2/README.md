# Pub-IQ EC2 Terraform Module

Provisions a single Graviton EC2 instance running the Pub-IQ API stack behind Nginx/TLS, with:
- HTTPS via Let's Encrypt (certbot DNS-01, Route53 plugin — no port-80 listener needed)
- All secrets pulled from SSM Parameter Store at boot — nothing in user_data or state
- SSM Session Manager for admin shell access — port 22 is never opened
- Elastic IP + Route53 A record for `api.omicron-ailabs.com`

This module is independent of `../` (the CloudFront/S3 frontend module) and keeps its own remote state.

---

## Pre-requisites

| Requirement | Status |
|---|---|
| AWS credentials with EC2/IAM/SSM/Route53 permissions | You |
| Domain `omicron-ailabs.com` delegated to Route53 | Already done (zone `Z04449872U5HXUW4OZ064`) |
| State bucket + DynamoDB table | Run `bootstrap-state.sh` once (see below) |

---

## First-time setup

### 1. Bootstrap remote state (run once)

```bash
bash bootstrap-state.sh eu-west-3
```

This creates the `pubiq-tfstate` S3 bucket and `pubiq-tfstate-lock` DynamoDB table. Safe to re-run.

### 2. Set secrets

Set real values in SSM **before** or **at** `terraform apply`. The Terraform resources create placeholder `CHANGE_ME` entries; `ignore_changes = [value]` prevents Terraform from overwriting values you set out-of-band.

Option A — set via AWS CLI before apply (recommended):
```bash
for name in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB \
            TIKTOK_CLIENT_KEY TIKTOK_CLIENT_SECRET \
            ANTHROPIC_API_KEY JWT_SECRET API_KEYS; do
    aws ssm put-parameter \
        --name "/pubiq/$name" \
        --type SecureString \
        --value "$(read -sp "$name: " v; echo "$v")" \
        --region eu-west-3 \
        --overwrite
done
```

Option B — pass at apply time (values land in Terraform state — less ideal):
```bash
terraform apply \
  -var="secret_postgres_password=..." \
  -var="secret_anthropic_api_key=sk-ant-..." \
  ...
```

### 3. Init, plan, apply

```bash
terraform init
terraform plan -out tfplan
terraform apply tfplan
```

Total apply time is roughly 2–3 minutes for resource creation, then ~5–8 minutes for the instance to finish cloud-init (Docker build, cert issuance, stack start).

### 4. Verify

```bash
curl https://api.omicron-ailabs.com/health
```

Expected: `{"status":"ok"}` or `{"status":"degraded"}` (if `ANTHROPIC_API_KEY` is missing — see CLAUDE.md).

---

## Admin access (no SSH)

Use SSM Session Manager — the output `ssm_session_command` prints the exact command:

```bash
aws ssm start-session --target <instance-id> --region eu-west-3
```

Or via the AWS console: EC2 → Instances → Connect → Session Manager.

Boot log is at `/var/log/pubiq-init.log` on the instance.

---

## Variables that need real values before first apply

| Variable | Purpose | Where to get it |
|---|---|---|
| `secret_postgres_password` | Postgres password | Generate: `openssl rand -hex 32` |
| `secret_tiktok_client_key` | TikTok OAuth key | TikTok Developer Portal |
| `secret_tiktok_client_secret` | TikTok OAuth secret | TikTok Developer Portal |
| `secret_anthropic_api_key` | Claude inference | console.anthropic.com |
| `secret_jwt_secret` | JWT signing | Generate: `openssl rand -hex 64` |
| `secret_api_keys` | App API keys | Generate: comma-separated UUIDs |

`secret_postgres_user` and `secret_postgres_db` have sensible defaults (`CHANGE_ME` / `pubiq`); override if you want different values.

---

## What is genuinely outside Terraform's reach

**Domain ownership / delegation**: `omicron-ailabs.com` must be registered and its NS records must point to the Route53 hosted zone `Z04449872U5HXUW4OZ064`. This is already the case — no action needed. If you ever transfer the domain to a new registrar, update the NS records manually.

---

## Teardown

```bash
terraform destroy
```

The EIP, EC2 instance, security group, IAM role, and Route53 record are destroyed. SSM parameters are also destroyed — export secrets first if you need them elsewhere. The state S3 bucket and DynamoDB table are **not** managed by this module (they were created by `bootstrap-state.sh`) and must be deleted manually.

---

## TODO (accepted MVP tradeoff)

> **Postgres durability**: Postgres runs as a Docker Compose service on the same EC2 instance. DBOS's durable-workflow guarantee is only as strong as this database. If the instance fails before a `pgdata` volume snapshot, uncommitted workflow state is lost. **RDS (Multi-AZ)** is the natural next step once the early-tester phase is complete — it would require updating `DBOS_SYSTEM_DATABASE_URL` and `DATABASE_URL` in `.env` to point at the RDS endpoint and removing the `postgres` service from `docker-compose.yml`.
