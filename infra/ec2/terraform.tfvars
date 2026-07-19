# Pub-IQ EC2 deployment variables
# ---------------------------------------------------------------------------
# Secrets: set these via environment variables or a secrets manager.
# DO NOT commit real values to version control.
#
# Example (one-time setup, or update as needed):
#   aws ssm put-parameter --name /pubiq/POSTGRES_PASSWORD \
#       --type SecureString --value "..." --overwrite
#
# Alternatively pass at apply time:
#   terraform apply \
#     -var="secret_postgres_password=..." \
#     -var="secret_tiktok_client_id=..." \
#     ...
# ---------------------------------------------------------------------------

aws_region     = "eu-west-3"
environment    = "production"
instance_type  = "t4g.small"
domain_name    = "omicron-ailabs.com"
hosted_zone_id = "Z04449872U5HXUW4OZ064"
app_repo       = "https://github.com/engom/creator-assistant.git"

# Leave secret_* at their CHANGE_ME defaults here.
# Set real values out-of-band via SSM or -var flags — never commit them.
