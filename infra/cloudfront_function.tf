##############################################################################
# CloudFront Function — Clean URL Rewrite
#
# Rewrites extensionless request URIs to .html before they reach S3,
# enabling canonical URLs without file extensions (e.g. /blog/some-article).
#
# Runtime: cloudfront-js-2.0  (ES6+, viewer-request only, <1 ms latency)
# Free tier: 2 000 000 invocations/month
##############################################################################

resource "aws_cloudfront_function" "url_rewrite" {
  name    = "${replace(var.bucket_name, ".", "-")}-url-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite extensionless URIs to .html for clean canonical URLs"
  publish = true
  code    = file("${path.module}/functions/url_rewrite.js")
}
