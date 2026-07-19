variable "aws_region" {
  description = "AWS region. eu-west-3 (Paris) for EU data residency."
  type        = string
  default     = "eu-west-3"
}

variable "environment" {
  description = "Deployment environment tag (e.g. production, staging)."
  type        = string
  default     = "production"
}

variable "instance_type" {
  description = "EC2 instance type. Must be Graviton (arm64) to match the Ubuntu arm64 AMI."
  type        = string
  default     = "t4g.small"
}

variable "domain_name" {
  description = "Apex domain managed in Route53. The API is served at api.<domain_name>."
  type        = string
  default     = "omicron-ailabs.com"
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for domain_name. Already exists: Z04449872U5HXUW4OZ064."
  type        = string
  default     = "Z04449872U5HXUW4OZ064"
}

variable "app_repo" {
  description = "Git repository URL to clone on the instance (public repo, no deploy key needed)."
  type        = string
  default     = "https://github.com/engom/creator-assistant.git"
}

# ---------------------------------------------------------------------------
# Secrets — never set real values here; override at apply time or post-apply
# via the AWS console/CLI. The lifecycle { ignore_changes = [value] } blocks
# on the SSM resources mean Terraform won't clobber values you set out-of-band.
# ---------------------------------------------------------------------------
variable "secret_postgres_user" {
  description = "Postgres superuser name. Override before first apply."
  type        = string
  sensitive   = true
  default     = "CHANGE_ME"
}

variable "secret_postgres_password" {
  description = "Postgres superuser password. Override before first apply."
  type        = string
  sensitive   = true
  default     = "CHANGE_ME"
}

variable "secret_postgres_db" {
  description = "Postgres database name."
  type        = string
  sensitive   = true
  default     = "pubiq"
}

variable "secret_tiktok_client_id" {
  description = "TikTok OAuth client ID (from TikTok Developer Portal)."
  type        = string
  sensitive   = true
  default     = "CHANGE_ME"
}

variable "secret_tiktok_client_secret" {
  description = "TikTok OAuth client secret."
  type        = string
  sensitive   = true
  default     = "CHANGE_ME"
}

variable "secret_jwt_secret" {
  description = "JWT signing secret. Use a long random string."
  type        = string
  sensitive   = true
  default     = "CHANGE_ME"
}

variable "secret_api_keys" {
  description = "Comma-separated API keys accepted by the app (API_KEYS env var)."
  type        = string
  sensitive   = true
  default     = "CHANGE_ME"
}
