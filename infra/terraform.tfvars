# Example Terraform variables file
# Copy this to terraform.tfvars and update with your values

# Required: Unique S3 bucket name
bucket_name = "elhadji-ngom-portfolio-2025"

# Optional: Custom domain (requires ACM certificate)
domain_name = "omicron-ailabs.com" # Disabled - need to own domain and set hosted_zone_id

# Optional: Route53 hosted zone ID (if using custom domain)
hosted_zone_id = "Z04449872U5HXUW4OZ064"

# AWS region for resources
aws_region = "eu-west-1"

# CloudFront price class (affects cost)
cloudfront_price_class = "PriceClass_100" # Cheapest option

# Tags for all resources
tags = {
  Project     = "Elhadji-Portfolio"
  Environment = "Production"
  Owner       = "Elhadji Ngom"
  ManagedBy   = "Terraform"
}