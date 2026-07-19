output "certificate_arn" {
  description = "ARN of the ACM certificate for CloudFront"
  value       = length(aws_acm_certificate.cert) > 0 ? aws_acm_certificate.cert[0].arn : null
}

output "s3_bucket_id" {
  description = "ID of the S3 bucket"
  value       = aws_s3_bucket.site.id
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.cdn.id
}

output "website_url" {
  description = "URL of the website"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.cdn.domain_name}"
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.cdn.domain_name
}

output "url_rewrite_function_arn" {
  description = "ARN of the CloudFront URL-rewrite function (clean canonical URLs)"
  value       = aws_cloudfront_function.url_rewrite.arn
}
