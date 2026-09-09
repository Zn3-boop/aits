# LPM AI Companion 诊断和修复脚本

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "LPM AI Companion 诊断报告" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 edge-tts Python 包
Write-Host "[1/6] 检查 edge-tts Python 包..." -ForegroundColor Yellow
$edgeTts = & .venv\Scripts\python.exe -m edge_tts --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ edge-tts 已安装: $edgeTts" -ForegroundColor Green
} else {
    Write-Host "✗ edge-tts 未安装，正在安装..." -ForegroundColor Red
    & pip install edge-tts
}
Write-Host ""

# 2. 检查后端服务状态
Write-Host "[2/6] 检查后端服务状态..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "http://localhost:8787/health" -Method GET -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    if ($health.StatusCode -eq 200) {
        Write-Host "✓ 后端服务正在运行 (localhost:8787)" -ForegroundColor Green
        Write-Host "  健康状态: $($health.Content)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ 后端服务未运行" -ForegroundColor Red
    Write-Host "  正在启动后端服务..." -ForegroundColor Yellow
    
    # 尝试启动后端
    Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory "apps/server" -NoNewWindow -PassThru -ErrorAction SilentlyContinue
    
    Write-Host "  等待 5 秒后重试..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    try {
        $health = Invoke-WebRequest -Uri "http://localhost:8787/health" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($health.StatusCode -eq 200) {
            Write-Host "✓ 后端服务已启动" -ForegroundColor Green
        }
    } catch {
        Write-Host "✗ 后端服务启动失败" -ForegroundColor Red
    }
}
Write-Host ""

# 3. 检查 TTS API
Write-Host "[3/6] 检查 TTS API..." -ForegroundColor Yellow
try {
    $ttsHealth = Invoke-WebRequest -Uri "http://localhost:8787/api/tts/health" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($ttsHealth.StatusCode -eq 200) {
        Write-Host "✓ TTS API 正常" -ForegroundColor Green
        Write-Host "  状态: $($ttsHealth.Content)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ TTS API 不可用" -ForegroundColor Red
    Write-Host "  错误: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 4. 检查前端开发服务器
Write-Host "[4/6] 检查前端开发服务器..." -ForegroundColor Yellow
try {
    $vite = Invoke-WebRequest -Uri "http://localhost:5173" -Method GET -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    if ($vite.StatusCode -eq 200) {
        Write-Host "✓ Vite 开发服务器正在运行 (localhost:5173)" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Vite 开发服务器未运行" -ForegroundColor Red
    Write-Host "  提示: 运行 'npm run dev' 在 apps/web 目录" -ForegroundColor Yellow
}
Write-Host ""

# 5. 测试 TTS 合成
Write-Host "[5/6] 测试 TTS 合成..." -ForegroundColor Yellow
$body = @{
    text = "你好，测试语音合成"
    voice = "zh-CN-XiaoxiaoNeural"
} | ConvertTo-Json

try {
    $ttsResult = Invoke-WebRequest -Uri "http://localhost:8787/api/tts/synthesize" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
    if ($ttsResult.StatusCode -eq 200) {
        Write-Host "✓ TTS 合成成功" -ForegroundColor Green
        Write-Host "  返回大小: $($ttsResult.Content.Length) 字节" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ TTS 合成失败" -ForegroundColor Red
    Write-Host "  错误: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 6. 端口配置检查
Write-Host "[6/6] 检查端口配置..." -ForegroundColor Yellow
Write-Host "  前端可能运行在: 5173 或 5174" -ForegroundColor Gray
Write-Host "  后端运行在: 8787" -ForegroundColor Gray
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "诊断完成" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "如果 TTS 仍然失败，请检查:" -ForegroundColor Yellow
Write-Host "  1. 后端终端是否有错误信息" -ForegroundColor Gray
Write-Host "  2. edge-tts npm 包是否安装: cd apps/server && npm install edge-tts" -ForegroundColor Gray
Write-Host "  3. 重新启动服务" -ForegroundColor Gray
