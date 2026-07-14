# コストの安全網: Projectタグでcard-pair-scanner関連リソースのみに絞って月額支出を監視する。
# (タグを付けていないと、同一AWSアカウント内の無関係なリソースのコストまで拾ってしまうため)
resource "aws_budgets_budget" "guard" {
  name         = "card-pair-scanner-guard"
  budget_type  = "COST"
  limit_amount = "7"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$card-pair-scanner"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
