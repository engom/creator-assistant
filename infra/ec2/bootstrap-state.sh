#!/bin/bash
# One-time bootstrap: create the S3 bucket + DynamoDB table for Terraform remote state.
# Run this ONCE before `terraform init`. It is idempotent — safe to re-run.
#
# Usage:
#   AWS_PROFILE=your-profile bash bootstrap-state.sh [region]
#   region defaults to eu-west-3
set -euo pipefail

REGION="${1:-eu-west-3}"
BUCKET="pubiq-tfstate"
TABLE="pubiq-tfstate-lock"

echo "Bootstrap: region=$REGION  bucket=$BUCKET  table=$TABLE"

# S3 bucket — versioning on so you can roll back state files
aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" \
    2>/dev/null || echo "  Bucket already exists, continuing."

aws s3api put-bucket-versioning \
    --bucket "$BUCKET" \
    --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
    --bucket "$BUCKET" \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block \
    --bucket "$BUCKET" \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# DynamoDB table — PAY_PER_REQUEST keeps cost near-zero for a single-team setup
aws dynamodb create-table \
    --table-name "$TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" \
    2>/dev/null || echo "  DynamoDB table already exists, continuing."

echo "Done. You can now run: terraform init"
