# ⚠️⚠️⚠️ 重要文件 - 请勿删除 ⚠️⚠️⚠️

## 项目名称：faster-whisper (快速Whisper语音识别引擎)

---

## 📌这是什么？

**faster-whisper** 是一个高效的语音识别（Speech-to-Text, STT）库，基于 OpenAI 的 Whisper 模型，但使用 CTranslate2 进行了优化，速度比原始 Whisper 快 2-4 倍，同时内存使用更少。

### 关键特性：
- 🚀 **高速识别**：比原生 Whisper 快 2-4 倍
- 💾 **内存高效**：支持 int8 量化，大幅降低内存占用
- 🎯 **高精度**：保持与原版 Whisper 相当的识别准确率
- 🌐 **离线运行**：不需要网络连接，保护隐私
- 🇨🇳 **中文友好**：完全支持中文语音识别

---

## 🎯它的作用是什么？

### 1. 语音输入功能
这是本项目的**核心语音识别引擎**，用于：
- 🎤 将你的麦克风语音实时转录为文字
- 💬 实现语音命令输入
- 📝 语音转文字的各种应用场景

### 2. 在本项目中的具体应用
- **前端界面**：通过 `useVoiceInput.ts` hook 调用
- **后端服务**：`faster-whisper-server.py` 提供 API 服务
- **语音识别路由**：`stt.ts` 处理语音识别请求
- **安装脚本**：`stt-setup.py` 管理安装和配置

---

## ❌为什么不能删除？

### 🔴 核心功能依赖
1. **语音输入完全依赖此库** - 删除后所有语音功能失效
2. **没有可行的替代方案** - 虽然有其他语音识别方案（如 FunASR、阿里云），但都需要额外配置
3. **用户界面已深度集成** - 前端代码直接调用此服务

### 🔴 替代方案的问题
- **Google 语音识别**：需要网络，不支持本地，隐私风险
- **FunASR**：阿里开源，但配置复杂，体积大
- **阿里云/腾讯云 API**：需要账号、付费、网络依赖

### 🔴 优势总结
✅ **本地运行**：无需网络，完全离线可用  
✅ **快速响应**：延迟低，用户体验好  
✅ **隐私安全**：音频数据不上传服务器  
✅ **零成本**：无需付费，无需 API key  
✅ **易于部署**：pip 一键安装，自动下载模型  

---

## 📦 技术信息

### 安装信息
- **包名**：`faster-whisper`
- **版本**：1.2.1
- **安装位置**：项目虚拟环境 `.venv`
- **Python 版本**：兼容 Python 3.8+

### 依赖库
- `ctranslate2`：核心推理引擎
- `onnxruntime`：ONNX 运行时
- `huggingface-hub`：模型下载管理
- `tokenizers`：分词器
- `av`：音视频处理（ffmpeg 集成）

### 模型信息
- **默认模型**：`base`（约 140MB）
- **可用模型**：`tiny`, `base`, `small`, `medium`, `large`
- **模型下载位置**：`temp` 目录下的 `faster-whisper-models` 文件夹
- **首次加载**：需要联网下载模型（约 140MB）

---

## 🔧 如何使用

### 快速启动语音服务
```bash
# 激活虚拟环境
.\.venv\Scripts\Activate.ps1

# 启动 faster-whisper 服务
python tools\faster-whisper-server.py
```

### 验证安装
```bash
python -c "import faster_whisper; print(faster_whisper.__version__)"
```

### 手动安装（如果损坏）
```bash
pip install faster-whisper -i https://pypi.tuna.tsinghua.edu.cn/simple
```

---

## 🚨 给未来开发者的警告

### ⚠️ 重要提醒

**如果你正在考虑删除这个项目或这个依赖，请先阅读：**

1. **这个项目 100% 依赖 faster-whisper 实现语音功能**
2. 删除后，用户将无法使用语音输入
3. 没有简单的方法来恢复这个功能
4. 其他替代方案都需要额外配置和付费

### 💡 建议

如果你确实需要重构或优化：
- ✅ 先阅读 `apps/server/scripts/stt-setup.py` 了解安装流程
- ✅ 先阅读 `tools/faster-whisper-server.py` 了解服务实现
- ✅ 先阅读 `apps/web/src/hooks/useVoiceInput.ts` 了解前端集成
- ❌ **不要直接删除包或相关文件**
- ❌ **不要假设可以轻松找到替代品**

### 📞 如果遇到问题

优先查看官方文档：https://github.com/SYSTRAN/faster-whisper

---

## 📝 版本历史

- **2024**: 集成 faster-whisper 1.2.1 版本
- 解决了原版 Whisper 速度慢的问题
- 实现了中文语音识别功能

---

## 🏷️ 标签

`#语音识别` `#STT` `#Whisper` `#faster-whisper` `#核心依赖` `#不可删除`

---

**创建日期**：2026-08-24  
**最后更新**：2026-08-24  
**维护者**：AI Assistant

---

> 💡 **提示**：这份文档是为了防止未来不小心删除重要的依赖。如果需要更新信息，请同时更新此文档。
