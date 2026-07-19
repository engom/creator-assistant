output "elastic_ip" {
  description = "Elastic IP address attached to the API instance."
  value       = aws_eip.api.public_ip
}

output "api_url" {
  description = "HTTPS base URL for the Pub-IQ API."
  value       = "https://api.${var.domain_name}"
}

output "instance_id" {
  description = "EC2 instance ID — use with SSM Session Manager for shell access."
  value       = aws_instance.api.id
}

output "ssm_session_command" {
  description = "AWS CLI command to open an interactive shell via SSM (no SSH needed)."
  value       = "aws ssm start-session --target ${aws_instance.api.id} --region ${var.aws_region}"
}
