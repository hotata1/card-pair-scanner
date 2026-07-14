variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "allowed_origin" {
  description = "PWA配信元(CORS許可オリジン)"
  type        = string
  default     = "https://hotata1.github.io"
}

variable "budget_alert_email" {
  description = "コスト超過アラートの通知先メールアドレス"
  type        = string
  default     = "onoshota39@gmail.com"
}

variable "app_urls" {
  description = "Cognito Hosted UIのコールバック/ログアウト許可URL(アプリの配信先)"
  type        = list(string)
  default     = ["https://hotata1.github.io/card-pair-scanner/", "http://localhost:5173/"]
}
