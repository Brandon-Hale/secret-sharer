locals {
  api_host      = var.domain_name == "" ? "" : "api.${var.domain_name}"
  domain_enable = var.domain_name == "" ? 0 : 1
}

# The endpoint is regional, so the certificate belongs in this region. The
# us-east-1 rule people remember applies to edge-optimised endpoints and
# CloudFront, and this API uses neither.
resource "aws_acm_certificate" "api" {
  count = local.domain_enable

  domain_name       = local.api_host
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_domain_name" "api" {
  count = local.domain_enable

  domain_name              = local.api_host
  regional_certificate_arn = aws_acm_certificate.api[0].arn
  security_policy          = "TLS_1_2"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_base_path_mapping" "api" {
  count = local.domain_enable

  api_id      = aws_api_gateway_rest_api.this.id
  stage_name  = aws_api_gateway_stage.prod.stage_name
  domain_name = aws_api_gateway_domain_name.api[0].domain_name
}

# DNS records are created by hand at whichever registrar holds the zone. The
# domain need not live in Route 53, and aws_acm_certificate_validation would
# block apply indefinitely if the records never appeared.
output "acm_validation_records" {
  description = "Create these records at your DNS provider to validate the certificate."
  value = local.domain_enable == 0 ? [] : [
    for option in aws_acm_certificate.api[0].domain_validation_options : {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  ]
}

output "api_domain_name" {
  description = "Public hostname of the API, once DNS points at api_domain_target."
  value       = local.domain_enable == 0 ? "" : local.api_host
}

output "api_domain_target" {
  description = "Point api.<domain> here with a CNAME, or an ALIAS record in Route 53."
  value       = local.domain_enable == 0 ? "" : aws_api_gateway_domain_name.api[0].regional_domain_name
}
