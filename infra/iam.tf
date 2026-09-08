data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "create" {
  name               = "onetime-create"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role" "retrieve" {
  name               = "onetime-retrieve"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "create_logs" {
  role       = aws_iam_role.create.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "retrieve_logs" {
  role       = aws_iam_role.retrieve.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# One action each. Neither function can Scan, Query or GetItem, so neither can
# enumerate the table or read a secret it did not just destroy. If one is
# compromised, the blast radius is that single operation.
data "aws_iam_policy_document" "create" {
  statement {
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.secrets.arn]
  }
}

# DeleteItem with ALL_OLD is how retrieve reads. It needs no read permission.
data "aws_iam_policy_document" "retrieve" {
  statement {
    actions   = ["dynamodb:DeleteItem"]
    resources = [aws_dynamodb_table.secrets.arn]
  }
}

resource "aws_iam_role_policy" "create" {
  name   = "onetime-create-ddb"
  role   = aws_iam_role.create.id
  policy = data.aws_iam_policy_document.create.json
}

resource "aws_iam_role_policy" "retrieve" {
  name   = "onetime-retrieve-ddb"
  role   = aws_iam_role.retrieve.id
  policy = data.aws_iam_policy_document.retrieve.json
}
