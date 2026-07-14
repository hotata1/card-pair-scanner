resource "aws_apigatewayv2_api" "recognize" {
  name          = "card-pair-scanner-recognize"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_integration" "recognize" {
  api_id                 = aws_apigatewayv2_api.recognize.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.recognize.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "recognize" {
  api_id             = aws_apigatewayv2_api.recognize.id
  route_key          = "POST /recognize"
  target             = "integrations/${aws_apigatewayv2_integration.recognize.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.recognize.id
  name        = "$default"
  auto_deploy = true

  # コスト暴走防止: 通常利用(連写8枚/4秒=最大2req/s)に対して最小限の余裕のみ持たせる。
  default_route_settings {
    throttling_burst_limit = 6
    throttling_rate_limit  = 3
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.recognize.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.recognize.execution_arn}/*/*"
}
