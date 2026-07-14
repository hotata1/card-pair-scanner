data "archive_file" "recognize" {
  type        = "zip"
  source_file = "${path.module}/lambda/handler.py"
  output_path = "${path.module}/build/handler.zip"
}

resource "aws_iam_role" "lambda_exec" {
  name = "card-pair-scanner-recognize-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "rekognition_detect_text" {
  name = "rekognition-detect-text"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["rekognition:DetectText"]
      Resource = "*"
    }]
  })
}

resource "aws_lambda_function" "recognize" {
  function_name    = "card-pair-scanner-recognize"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "handler.handler"
  runtime          = "python3.12"
  timeout          = 10
  memory_size      = 512
  filename         = data.archive_file.recognize.output_path
  source_code_hash = data.archive_file.recognize.output_base64sha256

  environment {
    variables = {
      ALLOWED_ORIGIN = var.allowed_origin
    }
  }
}

resource "aws_cloudwatch_log_group" "recognize" {
  name              = "/aws/lambda/${aws_lambda_function.recognize.function_name}"
  retention_in_days = 14
}
