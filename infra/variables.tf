variable "region" {
  type        = string
  description = "AWS region. The ACM certificate is regional, so it lives here too."
  default     = "ap-southeast-2"
}

variable "table_name" {
  type        = string
  description = "DynamoDB table holding ciphertext."
  default     = "onetime-secrets"
}

variable "allowed_origin" {
  type        = string
  description = "The single origin allowed by CORS, e.g. https://onetime.example.com."

  validation {
    # CORS is not the security control here — the API has no cookies and no
    # ambient auth, so a hostile page gains nothing curl could not. A wildcard
    # is still refused: it invites freeloading and costs nothing to avoid.
    condition     = can(regex("^https://[a-z0-9.-]+$", var.allowed_origin))
    error_message = "allowed_origin must be a single https origin with no path and no wildcard."
  }
}

variable "domain_name" {
  type        = string
  description = "Apex domain. The API is served at api.<domain_name>. Empty disables the custom domain."
  default     = ""
}

variable "budget_alert_email" {
  type        = string
  description = "Address for the monthly budget alarm. Empty disables the budget."
  default     = ""
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch retention for both functions."
  default     = 14
}
