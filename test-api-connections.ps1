# 测试 API 连接脚本 - 简化版

Write-Host "=== API 连接测试 ===" -ForegroundColor Cyan

# 测试 Ollama 连接
Write-Host "`n[1] 测试 Ollama (http://127.0.0.1:11434)" -ForegroundColor Yellow
try {
    $ollamaResponse = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ Ollama 已连接" -ForegroundColor Green
    Write-Host "状态码: $($ollamaResponse.StatusCode)"
    $models = $ollamaResponse.Content | ConvertFrom-Json
    if ($models.models) {
        Write-Host "可用模型: $($models.models.name -join ', ')"
    }
} catch {
    Write-Host "❌ Ollama 未运行或无法连接" -ForegroundColor Red
    Write-Host "提示: 请运行 'ollama serve' 启动 Ollama" -ForegroundColor Yellow
}

# 测试后端服务器
Write-Host "`n[2] 测试后端服务器 (http://127.0.0.1:8787)" -ForegroundColor Yellow
try {
    $serverResponse = Invoke-WebRequest -Uri "http://127.0.0.1:8787/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ 后端服务器已连接" -ForegroundColor Green
    Write-Host "状态码: $($serverResponse.StatusCode)"
} catch {
    Write-Host "❌ 后端服务器未运行或无法连接" -ForegroundColor Red
    Write-Host "提示: 运行 'pnpm dev' 或 'npm run dev' 启动服务器" -ForegroundColor Yellow
}

# 测试前端开发服务器
Write-Host "`n[3] 测试前端服务器 (http://localhost:5173)" -ForegroundColor Yellow
try {
    $webResponse = Invoke-WebRequest -Uri "http://localhost:5173" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ 前端服务器已连接" -ForegroundColor Green
    Write-Host "状态码: $($webResponse.StatusCode)"
} catch {
    Write-Host "❌ 前端服务器未运行或无法连接" -ForegroundColor Red
    Write-Host "提示: 运行 'pnpm dev' 或 'npm run dev' 启动前端" -ForegroundColor Yellow
}

Write-Host "`n=== 测试完成 ===" -ForegroundColor Cyan
