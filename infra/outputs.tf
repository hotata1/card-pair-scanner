output "api_endpoint" {
  value       = "${aws_apigatewayv2_stage.default.invoke_url}recognize"
  description = "フロントエンドのVITE_AWS_RECOGNIZE_URLに設定するエンドポイント"
}

output "cognito_domain" {
  value       = "https://${aws_cognito_user_pool_domain.app.domain}.auth.${var.aws_region}.amazoncognito.com"
  description = "フロントエンドのVITE_COGNITO_DOMAINに設定するHosted UIドメイン"
}

output "cognito_client_id" {
  value       = aws_cognito_user_pool_client.spa.id
  description = "フロントエンドのVITE_COGNITO_CLIENT_IDに設定するアプリクライアントID"
}

output "cognito_user_pool_id" {
  value       = aws_cognito_user_pool.app.id
  description = "ユーザー作成(aws cognito-idp admin-create-user)に使うUser Pool ID"
}
