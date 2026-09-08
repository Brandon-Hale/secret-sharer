variable "github_repository" {
  type        = string
  description = "owner/repo permitted to assume the deploy role. Empty disables OIDC."
  default     = ""
}

variable "github_oidc_provider_arn" {
  type        = string
  description = <<-EOT
    ARN of the existing GitHub OIDC provider in this account. One provider is
    shared by every repository, so it is created once by hand rather than
    owned by this stack — importing or recreating it would break unrelated
    pipelines. Empty means Terraform derives the conventional ARN.
  EOT
  default     = ""
}

locals {
  oidc_enable = var.github_repository == "" ? 0 : 1
  oidc_provider_arn = var.github_oidc_provider_arn != "" ? var.github_oidc_provider_arn : (
    "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
  )
}

data "aws_iam_policy_document" "github_assume" {
  count = local.oidc_enable

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Scoped to main on this repository. Without a sub condition, any GitHub
    # account anywhere could assume this role.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  count = local.oidc_enable

  name               = "onetime-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume[0].json
}

# No permissions policy is attached here. A policy wide enough to manage IAM,
# Lambda, API Gateway and DynamoDB is effectively account admin, and granting
# that to CI is the one decision in this stack worth making by hand, in the
# console, deliberately. Record the attached policy ARN in the README.

output "deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN secret in GitHub Actions."
  value       = local.oidc_enable == 0 ? "" : aws_iam_role.deploy[0].arn
}
