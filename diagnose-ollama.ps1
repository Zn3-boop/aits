# Ollama 诊断脚本 - 检查 Ollama 状态和配置
# 解决 WSL/Windows 网络互通问题

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Ollama 诊断报告" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"

# 检查 Ollama 服务是否运行
Write-Host "[1/6] 检查 Ollama 进程..." -ForegroundColor Yellow
$ollamaProcess = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if ($ollamaProcess) {
    Write-Host "  ✓ Ollama 进程正在运行 (PID: $($ollamaProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "  ✗ Ollama 进程未运行" -ForegroundColor Red
    Write-Host "    修复: 启动 Ollama - 管理员权限运行 'ollama serve'" -ForegroundColor White
}
Write-Host ""

# 检查 Ollama API 端点 (localhost)
Write-Host "[2/6] 检查 localhost:11434..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:11434" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  ✓ Ollama API 响应正常" -ForegroundColor Green
    Write-Host "    响应: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "  ✗ 无法连接到 localhost:11434" -ForegroundColor Red
    Write-Host "    错误: $($_.Exception.Message)" -ForegroundColor Gray
}
Write-Host ""

# 检查 Ollama API 端点 (127.0.0.1)
Write-Host "[3/6] 检查 127.0.0.1:11434..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:11434" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  ✓ 127.0.0.1:11434 可访问" -ForegroundColor Green
} catch {
    Write-Host "  ✗ 无法连接到 127.0.0.1:11434" -ForegroundColor Red
}
Write-Host ""

# 检查 WSL localhost 转发
Write-Host "[4/6] 检查 WSL localhost 转发配置..." -ForegroundColor Yellow
$wslConfig = Get-Content "$env:USERPROFILE\.wslconfig" -ErrorAction SilentlyContinue
if ($wslConfig -match "localhostForwarding=true") {
    Write-Host "  ✓ localhost 转发已启用" -ForegroundColor Green
} elseif ($wslConfig) {
    Write-Host "  ⚠ localhost 转发可能未启用" -ForegroundColor Yellow
    Write-Host "    建议在 .wslconfig 中添加: [wsl2] localhostForwarding=true" -ForegroundColor Gray
} else {
    Write-Host "  ℹ 未找到 .wslconfig 文件" -ForegroundColor Cyan
    Write-Host "    如需配置，在 $env:USERPROFILE\.wslconfig 创建" -ForegroundColor Gray
}
Write-Host ""

# 检查已安装的模型
Write-Host "[5/6] 检查已安装的模型..." -ForegroundColor Yellow
Write-Host "  运行命令检查模型 (超时5秒)..." -ForegroundColor Gray
try {
    $models = timeout 5 ollama list 2>&1
    if ($LASTEXITCODE -eq 0 -or $models -notmatch "error") {
        Write-Host "$models" -ForegroundColor White
    } else {
        Write-Host "  ✗ 命令执行失败" -ForegroundColor Red
    }
} catch {
    Write-Host "  ⚠ 无法执行 ollama list (可能未在 PATH 中)" -ForegroundColor Yellow
    Write-Host "    尝试直接启动 Ollama 服务..." -ForegroundColor Gray
}
Write-Host ""

# 测试 Ollama API 版本
Write-Host "[6/6] 测试 Ollama API..." -ForegroundColor Yellow
try {
    $apiResponse = Invoke-RestMethod -Uri "http://localhost:11434/api/version" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  ✓ API 版本: $($apiResponse.version)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ 无法获取 API 版本" -ForegroundColor Red
}
Write-Host ""

# WSL 特定建议
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "WSL 网络问题解决方案" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "如果 Ollama 在 Windows 运行，但 WSL 访问不到：" -ForegroundColor White
Write-Host ""
Write-Host "方案1: Ollama 监听所有接口 (推荐)" -ForegroundColor Yellow
Write-Host "  setx OLLAMA_HOST ""0.0.0.0""   # Windows 环境变量" -ForegroundColor Gray
Write-Host "  然后重启 Ollama" -ForegroundColor Gray
Write-Host ""
Write-Host "方案2: 使用 Windows IP 地址" -ForegroundColor Yellow
Write-Host "  $hostIp = (Get-NetIPAddress -InterfaceAlias 'Ethernet*' -AddressFamily IPv4).IPAddress" -ForegroundColor Gray
Write-Host "  在 WSL 中: export OLLAMA_BASE_URL=""http://$hostIp:11434""" -ForegroundColor Gray
Write-Host ""
Write-Host "方案3: 端口转发" -ForegroundColor Yellow
Write-Host "  Windows (管理员): netsh interface portproxy add v4tov4 listenport=11434 listenaddress=127.0.0.1 connectport=11434 connectaddress=<WSL-IP>" -ForegroundColor Gray
Write-Host ""

# 检查防火墙
Write-Host "检查 Windows 防火墙..." -ForegroundColor Yellow
$firewallRule = Get-NetFirewallRule -DisplayName "Ollama*" -ErrorAction SilentlyContinue
if ($firewallRule) {
    Write-Host "  ✓ 找到 Ollama 防火墙规则" -ForegroundColor Green
} else {
    Write-Host "  ℹ 未找到专门的 Ollama 防火墙规则" -ForegroundColor Cyan
    Write-Host "    建议: 确保 11434 端口未被防火墙阻止" -ForegroundColor Gray
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "诊断完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
