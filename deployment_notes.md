# Pub-IQ Deployment Notes

## Live infrastructure (eu-west-3, Paris)

| Resource     | Value                                                  |
|--------------|--------------------------------------------------------|
| EC2 instance | `i-002a4de1c32795fb0` (t4g.small, Ubuntu 24.04 arm64) |
| Elastic IP   | `15.224.127.254`                                       |
| DNS          | `api.omicron-ailabs.com → 15.224.127.254`              |
| API URL      | `https://api.omicron-ailabs.com`                       |
| TLS cert     | Let's Encrypt, expires 2026-10-17 (auto-renews)        |
| State bucket | `s3://pubiq-tfstate` (eu-west-3)                       |
| LLM backend  | Bedrock via EC2 instance role — no API key needed      |

## Health check

```bash
curl https://api.omicron-ailabs.com/health
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
aws ssm start-session --target i-002a4de1c32795fb0 --region eu-west-3
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
  --region eu-west-3 --overwrite
```

Note: `systemctl restart` does NOT re-fetch SSM — secrets are written to `.env` only during initial boot. To apply a rotated secret, replace the instance (see Redeploy below).

## Redeploy (replace instance, re-runs full cloud-init)

```bash
cd infra/ec2
terraform taint aws_instance.api
terraform apply -auto-approve
```

Cloud-init runs fully unattended (~10 min): installs Docker + AWS CLI v2, clones repo, fetches secrets from SSM, applies DB schema, obtains TLS cert via Route53 DNS-01, starts the stack. LLM calls use the instance role — no API key required.

## Terraform state

```bash
cd infra/ec2
terraform show      # current state
terraform output    # endpoints + SSM session command
```

Remote state: `s3://pubiq-tfstate/pubiq/ec2/terraform.tfstate`
Lock table: `pubiq-tfstate-lock` (DynamoDB, eu-west-3)

## TODO

- RDS migration: Postgres runs in Docker on the EC2 instance. Data survives reboots but not instance replacement. Migrate to RDS (Multi-AZ) before going beyond the early-tester phase.
