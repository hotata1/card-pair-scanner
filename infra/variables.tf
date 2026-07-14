variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "allowed_origins" {
  description = "PWA配信元(CORS許可オリジン、複数可)。ローカル開発時のダブルチェック用にlocalhostも含める"
  type        = list(string)
  default     = ["https://hotata1.github.io", "http://localhost:5173"]
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
