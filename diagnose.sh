#!/bin/bash
# 诊断脚本 - 检查所有关键组件

echo "=========================================="
echo "LPM AI Companion 诊断报告"
echo "=========================================="
echo ""

echo "【1/5】检查 edge-tts Python 包..."
if pip show edge-tts 2>/dev/null | grep -q "Version:"; then
    pip show edge-tts 2>/dev/null | grep "Version:"
    echo "✓ edge-tts Python 包已安装"
else
    echo "✗ edge-tts Python 包未安装"
    echo "  修复: pip install edge-tts"
fi
echo ""

echo "【2/5】检查 Python edge_tts 模块是否可用..."
python -c "import edge_tts; print('✓ edge_tts 模块可导入')" 2>/dev/null || echo "✗ edge_tts 模块导入失败"
echo ""

echo "【3/5】检查后端 npm edge-tts 包..."
if [ -f "apps/server/node_modules/edge-tts/package.json" ]; then
    echo "✓ edge-tts npm 包已安装"
else
    echo "✗ edge-tts npm 包未安装"
    echo "  修复: cd apps/server && npm install edge-tts"
fi
echo ""

echo "【4/5】检查后端服务是否运行..."
curl -s --connect-timeout 2 http://localhost:8787/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ 后端服务正在运行 (localhost:8787)"
else
    echo "✗ 后端服务未运行"
    echo "  修复: 启动后端服务"
fi
echo ""

echo "【5/5】检查 Vite 开发服务器..."
curl -s --connect-timeout 2 http://localhost:5173 > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Vite 开发服务器正在运行 (localhost:5173)"
else
    echo "✗ Vite 开发服务器未运行"
    echo "  修复: npm run dev (在 apps/web 目录)"
fi
echo ""

echo "=========================================="
echo "测试 TTS API..."
echo "=========================================="
curl -s http://localhost:8787/api/tts/health 2>/dev/null || echo "TTS 健康检查失败 - 后端可能未运行"
echo ""

echo "=========================================="
echo "诊断完成"
echo "=========================================="
