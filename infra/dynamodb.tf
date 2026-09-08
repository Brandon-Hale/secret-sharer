resource "aws_dynamodb_table" "secrets" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  # TTL is the backstop, not the mechanism: deletion can lag by up to 48 hours,
  # so the retrieve handler re-checks expiresAt on every claim.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  # Off on purpose. A recoverable secret defeats the product — point-in-time
  # recovery would let anyone with restore rights read every secret ever
  # stored, including ones the sender believes are long gone.
  point_in_time_recovery {
    enabled = false
  }

  lifecycle {
    prevent_destroy = true
  }
}

output "table_name" {
  value = aws_dynamodb_table.secrets.name
}
