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

variable "github_owner_id" {
  type        = string
  description = <<-EOT
    Numeric GitHub account id of the repository owner. GitHub now mints
    immutable subject claims that identify the repo by id rather than by name,
    so the trust policy has to know these. Find them with:

      gh api repos/<owner>/<repo> --jq '{owner_id: .owner.id, repo_id: .id}'

    Empty falls back to matching the name-based claim only.
  EOT
  default     = ""
}

variable "github_repo_id" {
  type        = string
  description = "Numeric GitHub id of the repository. See github_owner_id."
  default     = ""
}

locals {
  oidc_enable = var.github_repository == "" ? 0 : 1

  # The subject claim comes in two shapes and which one GitHub sends is not
  # under our control, so both exact forms are allowed.
  #
  # The name form, repo:<owner>/<repo>, is the one every tutorial shows. The
  # immutable form, repo:<owner>@<owner id>/<repo>@<repo id>, is what GitHub
  # actually sends now; it survives a rename, which is the point of it, and it
  # is the stricter of the two because ids cannot be squatted.
  subject_prefixes = compact([
    "repo:${var.github_repository}",
    var.github_owner_id != "" && var.github_repo_id != "" ? format(
      "repo:%s@%s/%s@%s",
      split("/", var.github_repository)[0],
      var.github_owner_id,
      split("/", var.github_repository)[1],
      var.github_repo_id,
    ) : "",
  ])

  # A job that declares an environment gets environment:<name>; one that does
  # not gets ref:<git ref>. The deploy job declares production, so that is the
  # form in use — the ref form is kept so a job without an environment works,
  # and it stays pinned to main either way.
  allowed_subjects = flatten([
    for prefix in local.subject_prefixes : [
      "${prefix}:environment:production",
      "${prefix}:ref:refs/heads/main",
    ]
  ])
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

    # Without a sub condition, any GitHub account anywhere could assume this
    # role. See local.allowed_subjects for what these values mean.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.allowed_subjects
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

variable "state_bucket" {
  type        = string
  description = "State bucket the deploy role needs read/write on. Empty omits that grant."
  default     = ""
}

# Scoped to the resources this stack actually manages, rather than the
# AdministratorAccess that CI pipelines usually get handed. Everything is
# pinned to the onetime-* name prefix or to a single named resource.
data "aws_iam_policy_document" "deploy" {
  count = local.oidc_enable

  statement {
    sid = "TheTable"
    actions = [
      "dynamodb:CreateTable",
      "dynamodb:UpdateTable",
      "dynamodb:UpdateTimeToLive",
      "dynamodb:UpdateContinuousBackups",
      "dynamodb:TagResource",
      "dynamodb:UntagResource",
      "dynamodb:DescribeTable",
      "dynamodb:DescribeTimeToLive",
      "dynamodb:DescribeContinuousBackups",
      "dynamodb:DescribeTableReplicaAutoScaling",
      "dynamodb:DescribeKinesisStreamingDestination",
      "dynamodb:DescribeContributorInsights",
      "dynamodb:ListTagsOfResource",
    ]
    resources = [aws_dynamodb_table.secrets.arn]
  }

  # No DeleteTable, anywhere. prevent_destroy stops Terraform locally; leaving
  # the permission out stops a compromised pipeline entirely.
  statement {
    sid = "TheFunctions"
    actions = [
      "lambda:CreateFunction",
      "lambda:DeleteFunction",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:TagResource",
      "lambda:UntagResource",
      # Every one of these is read on refresh. A missing Get is an apply-time
      # AccessDenied, not a silent degradation, so they are listed in full.
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:GetFunctionCodeSigningConfig",
      "lambda:GetFunctionEventInvokeConfig",
      "lambda:GetFunctionUrlConfig",
      "lambda:GetFunctionConcurrency",
      "lambda:GetFunctionRecursionConfig",
      "lambda:GetRuntimeManagementConfig",
      "lambda:GetPolicy",
      "lambda:ListVersionsByFunction",
      "lambda:ListTags",
    ]
    resources = ["arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:onetime-*"]
  }

  statement {
    sid       = "TheRoles"
    actions   = ["iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole", "iam:PassRole", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies", "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags", "iam:ListInstanceProfilesForRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/onetime-*"]
  }

  statement {
    sid       = "TheLogGroups"
    actions   = ["logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy", "logs:TagResource", "logs:UntagResource", "logs:ListTagsForResource"]
    resources = ["arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/onetime-*"]
  }

  # DescribeLogGroups is a list operation: it takes a name prefix as a
  # parameter, not a resource, so AWS rejects any resource-level scoping on it.
  # Read-only, and it reveals nothing but log group names.
  statement {
    sid       = "FindLogGroups"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }

  # API Gateway ids are generated, so there is no name to scope to. The grant
  # is confined to the service and this region.
  statement {
    sid       = "TheApi"
    actions   = ["apigateway:GET", "apigateway:POST", "apigateway:PUT", "apigateway:PATCH", "apigateway:DELETE"]
    resources = ["arn:aws:apigateway:${var.region}::/*"]
  }

  statement {
    sid = "TheBudget"
    actions = [
      "budgets:ViewBudget",
      "budgets:ModifyBudget",
      "budgets:DescribeBudget",
      "budgets:CreateBudgetAction",
      "budgets:DeleteBudgetAction",
      "budgets:ListTagsForResource",
      "budgets:TagResource",
      "budgets:UntagResource",
    ]
    resources = ["arn:aws:budgets::${data.aws_caller_identity.current.account_id}:budget/onetime-*"]
  }

  # Only needed once domain_name is set. Certificate ARNs are generated.
  statement {
    sid       = "TheCertificate"
    actions   = ["acm:RequestCertificate", "acm:DescribeCertificate", "acm:DeleteCertificate", "acm:ListTagsForCertificate", "acm:AddTagsToCertificate"]
    resources = ["*"]
  }

  statement {
    sid       = "ReadItsOwnIdentity"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "deploy_state" {
  count = var.state_bucket == "" ? 0 : 1

  statement {
    sid       = "StateBucket"
    actions   = ["s3:ListBucket", "s3:GetBucketVersioning"]
    resources = ["arn:aws:s3:::${var.state_bucket}"]
  }

  # s3:DeleteObject is what releases the lock file after an apply.
  statement {
    sid       = "StateObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${var.state_bucket}/*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  count = local.oidc_enable

  name   = "onetime-deploy-stack"
  role   = aws_iam_role.deploy[0].id
  policy = data.aws_iam_policy_document.deploy[0].json
}

resource "aws_iam_role_policy" "deploy_state" {
  count = local.oidc_enable == 1 && var.state_bucket != "" ? 1 : 0

  name   = "onetime-deploy-state"
  role   = aws_iam_role.deploy[0].id
  policy = data.aws_iam_policy_document.deploy_state[0].json
}
