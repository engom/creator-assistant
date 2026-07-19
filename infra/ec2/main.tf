terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }

  backend "s3" {
    # Bucket and DynamoDB table are created once outside Terraform (see README).
    # Override via -backend-config or environment variables as needed.
    bucket         = "pubiq-tfstate"
    key            = "pubiq/ec2/terraform.tfstate"
    region         = "eu-west-3"
    dynamodb_table = "pubiq-tfstate-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Pub-IQ"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = "Elhadji Ngom"
    }
  }
}

# ---------------------------------------------------------------------------
# AMI — Ubuntu 24.04 LTS (arm64) via SSM public parameter
# Avoids hardcoded AMI IDs that go stale per region.
# ---------------------------------------------------------------------------
data "aws_ssm_parameter" "ubuntu_ami" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
}

# ---------------------------------------------------------------------------
# Networking — use the default VPC to keep things simple at MVP scale.
# ---------------------------------------------------------------------------
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ---------------------------------------------------------------------------
# Security group — 443 in from anywhere, 80 in only for ACME HTTP-01 fallback
# (DNS-01 is preferred; 80 is listed as a comment rather than a rule unless
# you switch challenge methods). No inbound 22 — SSM Session Manager is used
# for admin access instead.
# ---------------------------------------------------------------------------
resource "aws_security_group" "api" {
  name        = "pubiq-api-sg"
  description = "Pub-IQ API: HTTPS inbound, all outbound"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    # ipv6 added separately via ipv6_cidr_blocks if needed
  }

  # Port 80 is intentionally closed. The DNS-01 certbot plugin obtains the
  # certificate before the instance is reachable, so no ACME HTTP-01 listener
  # is needed. If you switch to HTTP-01 challenges, add an ingress rule here
  # (from_port=80, to_port=80) and update Nginx accordingly.

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "pubiq-api-sg"
  }
}

# ---------------------------------------------------------------------------
# IAM — instance role with SSM access (replaces SSH) + SSM Parameter Store
# read access scoped to /pubiq/* secrets only.
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "pubiq-api-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# AWS-managed policy that enables SSM Session Manager — no inbound SSH needed.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Least-privilege: read only /pubiq/* parameters.
data "aws_iam_policy_document" "ssm_params" {
  statement {
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = ["arn:aws:ssm:${var.aws_region}:*:parameter/pubiq/*"]
  }
  statement {
    # KMS decrypt for SecureString parameters (uses the AWS-managed SSM key).
    # Alias ARN format is alias/<name>, not key/alias/<name>.
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${var.aws_region}:*:alias/aws/ssm"]
  }
  statement {
    # Route53 access for certbot DNS-01 challenge (scoped to the hosted zone).
    actions = [
      "route53:GetChange",
      "route53:ListHostedZones",
      "route53:ListResourceRecordSets",
    ]
    resources = ["*"]
  }
  statement {
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = ["arn:aws:route53:::hostedzone/${var.hosted_zone_id}"]
  }
  statement {
    # Bedrock inference — LLM_MODEL=bedrock/... uses the instance role, no API key needed.
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["arn:aws:bedrock:*::foundation-model/*"]
  }
}

resource "aws_iam_role_policy" "ssm_params" {
  name   = "pubiq-ssm-params"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.ssm_params.json
}

resource "aws_iam_instance_profile" "api" {
  name = "pubiq-api-profile"
  role = aws_iam_role.api.name
}

# ---------------------------------------------------------------------------
# SSM Parameter Store — one SecureString per secret in .env.example.
# Values are set to placeholder strings here; replace them with real values
# before running `terraform apply` (via -var flags, a tfvars file, or
# AWS_SSM_PARAMETER_* env vars — never commit real secrets).
# ---------------------------------------------------------------------------
resource "aws_ssm_parameter" "postgres_user" {
  name  = "/pubiq/POSTGRES_USER"
  type  = "SecureString"
  value = var.secret_postgres_user
  overwrite = true
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "postgres_password" {
  name  = "/pubiq/POSTGRES_PASSWORD"
  type  = "SecureString"
  value = var.secret_postgres_password
  overwrite = true
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "postgres_db" {
  name  = "/pubiq/POSTGRES_DB"
  type  = "SecureString"
  value = var.secret_postgres_db
  overwrite = true
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "tiktok_client_id" {
  name  = "/pubiq/TIKTOK_CLIENT_ID"
  type  = "SecureString"
  value = var.secret_tiktok_client_id
  overwrite = true
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "tiktok_client_secret" {
  name  = "/pubiq/TIKTOK_CLIENT_SECRET"
  type  = "SecureString"
  value = var.secret_tiktok_client_secret
  overwrite = true
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/pubiq/JWT_SECRET"
  type  = "SecureString"
  value = var.secret_jwt_secret
  overwrite = true
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "api_keys" {
  name  = "/pubiq/API_KEYS"
  type  = "SecureString"
  value = var.secret_api_keys
  overwrite = true
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "tiktok_redirect_uri" {
  name  = "/pubiq/TIKTOK_REDIRECT_URI"
  type  = "SecureString"
  value = var.secret_tiktok_redirect_uri
  overwrite = true
  lifecycle { ignore_changes = [value] }
}

resource "aws_ssm_parameter" "cors_origins" {
  name  = "/pubiq/CORS_ORIGINS"
  type  = "String"
  value = var.cors_origins
  overwrite = true
  lifecycle { ignore_changes = [value] }
}

# ---------------------------------------------------------------------------
# EC2 instance — t4g.small (Graviton2, arm64, 2 vCPU / 2 GB RAM)
# ---------------------------------------------------------------------------
resource "aws_instance" "api" {
  ami                    = data.aws_ssm_parameter.ubuntu_ami.value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.api.id]
  iam_instance_profile   = aws_iam_instance_profile.api.name

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 25
    delete_on_termination = true
    encrypted             = true
  }

  user_data = templatefile("${path.module}/templates/user_data.sh.tpl", {
    domain         = var.domain_name
    aws_region     = var.aws_region
    app_repo       = var.app_repo
    llm_model      = var.llm_model
  })

  user_data_replace_on_change = false  # Don't auto-replace on config drift; redeploy intentionally.

  tags = {
    Name = "pubiq-api"
  }

  # Lifecycle: allow AMI/type updates without destroying existing data volume.
  lifecycle {
    ignore_changes = [ami]
  }
}

# ---------------------------------------------------------------------------
# Elastic IP — stable public IP that survives stop/start cycles.
# ---------------------------------------------------------------------------
resource "aws_eip" "api" {
  domain = "vpc"

  tags = {
    Name = "pubiq-api-eip"
  }
}

resource "aws_eip_association" "api" {
  instance_id   = aws_instance.api.id
  allocation_id = aws_eip.api.id
}

# ---------------------------------------------------------------------------
# DNS — A record pointing api.<domain> at the Elastic IP.
# ---------------------------------------------------------------------------
data "aws_route53_zone" "main" {
  zone_id = var.hosted_zone_id
}

resource "aws_route53_record" "api" {
  zone_id = var.hosted_zone_id
  name    = "api.${data.aws_route53_zone.main.name}"
  type    = "A"
  ttl     = 60
  records = [aws_eip.api.public_ip]
}

# ---------------------------------------------------------------------------
# deployment_notes.md — auto-generated at the repo root on every apply.
# Never edit the file manually; change the template below instead.
# ---------------------------------------------------------------------------
resource "local_file" "deployment_notes" {
  filename        = "${path.module}/../../deployment_notes.md"
  file_permission = "0644"
  content         = <<-EOT
    # Pub-IQ Deployment Notes

    ## Live infrastructure (eu-west-3, Paris)

    | Resource     | Value                                                    |
    |--------------|----------------------------------------------------------|
    | EC2 instance | `${aws_instance.api.id}` (${var.instance_type}, Ubuntu 24.04 arm64) |
    | Elastic IP   | `${aws_eip.api.public_ip}`                               |
    | DNS          | `api.${var.domain_name} → ${aws_eip.api.public_ip}`      |
    | API URL      | `https://api.${var.domain_name}`                         |
    | TLS cert     | Let's Encrypt, auto-renews via certbot cron              |
    | State bucket | `s3://pubiq-tfstate` (${var.aws_region})                 |
    | LLM backend  | Bedrock via EC2 instance role — no API key needed        |

    ## Health check

    ```bash
    curl https://api.${var.domain_name}/health
    # {"status":"ok"}       — all good
    # {"status":"degraded"} — LLM unreachable (check Bedrock IAM or model availability)
    ```

    ## Admin shell (no SSH — SSM Session Manager)

    Install the plugin once:

    ```bash
    curl -sL "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac_arm64/sessionmanager-bundle.zip" -o /tmp/ssm.zip && \
    unzip -q /tmp/ssm.zip -d /tmp/ssm && \
    sudo /tmp/ssm/sessionmanager-bundle/install -i /usr/local/sessionmanagerplugin -b /usr/local/bin/session-manager-plugin
    ```

    Connect:

    ```bash
    aws ssm start-session --target ${aws_instance.api.id} --region ${var.aws_region}
    ```

    ## Common operations

    **View API logs** (inside SSM session):

    ```bash
    docker compose --project-directory /opt/pubiq -f docker/docker-compose.yml logs -f api
    ```

    **Restart the stack:**

    ```bash
    sudo systemctl restart pubiq
    ```

    **Update a secret without redeploying:**

    ```bash
    aws ssm put-parameter --name /pubiq/<NAME> \
      --type SecureString --value "..." \
      --region ${var.aws_region} --overwrite
    ```

    Note: `systemctl restart` does NOT re-fetch SSM — secrets are written to `.env` only during
    initial boot. To apply a rotated secret, replace the instance (see Redeploy below).

    ## Redeploy (replace instance, re-runs full cloud-init)

    ```bash
    cd infra/ec2
    terraform taint aws_instance.api
    terraform apply -auto-approve
    ```

    Cloud-init runs fully unattended (~10 min): installs Docker + AWS CLI v2, clones repo,
    fetches secrets from SSM, applies DB schema, obtains TLS cert via Route53 DNS-01, starts
    the stack. LLM calls use the instance role — no API key required.

    ## Terraform state

    ```bash
    cd infra/ec2
    terraform show      # current state
    terraform output    # endpoints + SSM session command
    ```

    Remote state: `s3://pubiq-tfstate/pubiq/ec2/terraform.tfstate`
    Lock table: `pubiq-tfstate-lock` (DynamoDB, ${var.aws_region})

    ## TODO

    - RDS migration: Postgres runs in Docker on the EC2 instance. Data survives reboots but not
      instance replacement. Migrate to RDS (Multi-AZ) before going beyond the early-tester phase.
  EOT
}
