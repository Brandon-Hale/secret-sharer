locals {
  functions = {
    create = {
      role_arn   = aws_iam_role.create.arn
      source_dir = "${path.module}/../services/create/dist"
    }
    retrieve = {
      role_arn   = aws_iam_role.retrieve.arn
      source_dir = "${path.module}/../services/retrieve/dist"
    }
  }
}

# Bundles are produced by `npm run build -w @onetime/service-<name>` before
# apply. Terraform zips what esbuild left behind rather than building itself.
data "archive_file" "bundle" {
  for_each = local.functions

  type        = "zip"
  source_dir  = each.value.source_dir
  output_path = "${path.module}/.build/${each.key}.zip"
}

# Created explicitly so retention is bounded. Left implicit, Lambda creates
# these on first invocation with retention set to Never Expire.
resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.functions

  name              = "/aws/lambda/onetime-${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "this" {
  for_each = local.functions

  function_name = "onetime-${each.key}"
  role          = each.value.role_arn
  handler       = "index.handler"
  runtime       = "nodejs24.x"
  architectures = ["arm64"]
  memory_size   = 256
  timeout       = 5

  filename         = data.archive_file.bundle[each.key].output_path
  source_code_hash = data.archive_file.bundle[each.key].output_base64sha256

  environment {
    variables = {
      TABLE_NAME     = aws_dynamodb_table.secrets.name
      ALLOWED_ORIGIN = var.allowed_origin
      NODE_OPTIONS   = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}

output "create_function_name" {
  value = aws_lambda_function.this["create"].function_name
}

output "retrieve_function_name" {
  value = aws_lambda_function.this["retrieve"].function_name
}
