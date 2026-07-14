# アプリの入口を堰き止めるログイン(Hosted UI, Authorization Code + PKCE)。
# パスワードの保管・検証はCognitoに任せ、自前では平文比較を行わない。
resource "random_id" "cognito_domain_suffix" {
  byte_length = 4
}

resource "aws_cognito_user_pool" "app" {
  name = "card-pair-scanner"

  username_attributes = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  admin_create_user_config {
    allow_admin_create_user_only = true # セルフサインアップ不可(招待制)
  }
}

resource "aws_cognito_user_pool_domain" "app" {
  domain       = "card-pair-scanner-${random_id.cognito_domain_suffix.hex}"
  user_pool_id = aws_cognito_user_pool.app.id
}

resource "aws_cognito_user_pool_client" "spa" {
  name         = "card-pair-scanner-spa"
  user_pool_id = aws_cognito_user_pool.app.id

  generate_secret = false # ブラウザ完結のSPAクライアント(PKCEで秘匿情報なし)

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = var.app_urls
  logout_urls   = var.app_urls

  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.recognize.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.spa.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.app.id}"
  }
}
