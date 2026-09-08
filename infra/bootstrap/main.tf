# Creates the S3 bucket that holds the main configuration's state.
#
# This is separate because it is circular otherwise: the state backend cannot
# store the state of the thing that creates it. Run it once, by hand, with
# local state. Nothing else in this stack depends on it at apply time.
#
#   terraform -chdir=infra/bootstrap init
#   terraform -chdir=infra/bootstrap apply
#
# The resulting bucket name is what ../ takes as -backend-config="bucket=...".

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "onetime"
      ManagedBy = "terraform-bootstrap"
    }
  }
}

variable "region" {
  type    = string
  default = "ap-southeast-2"
}

data "aws_caller_identity" "current" {}

locals {
  # Bucket names are globally unique, so the account id makes this collision
  # free without hard-coding an identifier into the repository.
  bucket_name = "onetime-tfstate-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "state" {
  bucket = local.bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

# State files record every resource in the stack. A bad apply, or a bad merge,
# is recoverable only if the previous version is still there.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Terraform state holds resource identifiers and, in general, secrets. Nothing
# about this bucket should ever be reachable publicly.
resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "bucket" {
  description = "Pass to the main config as -backend-config=\"bucket=<this>\"."
  value       = aws_s3_bucket.state.bucket
}

# GitHub's OIDC identity provider, so Actions can assume a role without any
# stored access key. One provider serves every repository in the account, which
# is why it lives here rather than in the main config — that stack must not own
# something shared, or destroying it would break unrelated pipelines.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # AWS validates GitHub's certificate against a trusted root CA and no longer
  # uses these, but the API still requires the field.
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]

  lifecycle {
    prevent_destroy = true
  }
}

output "github_oidc_provider_arn" {
  description = "Pass to the main config as -var=\"github_oidc_provider_arn=<this>\"."
  value       = aws_iam_openid_connect_provider.github.arn
}
