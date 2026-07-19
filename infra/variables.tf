variable "bucket_name" {
  description = "Unique S3 bucket name for the static website"
  type        = string
}

variable "domain_name" {
  description = "Domain name for ACM certificate"
  type        = string
  default     = "omicron-ailabs.com"
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for the domain"
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "eu-west-1"
}

variable "cloudfront_price_class" {
  description = "CloudFront price class (affects cost)"
  type        = string
  default     = "PriceClass_100"
}

variable "tags" {
  description = "Tags for all resources"
  type        = map(string)
  default     = {}
}
