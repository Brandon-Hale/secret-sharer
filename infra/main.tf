terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.6"
    }
  }

  # State lives in S3. use_lockfile replaces the DynamoDB lock table that most
  # tutorials still describe. The bucket is created by hand, once, outside this
  # config — bootstrapping state storage from the state it stores is circular.
  #
  # bucket, key and region come from -backend-config at init time.
  backend "s3" {
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "onetime"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
