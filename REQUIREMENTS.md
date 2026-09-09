# 项目依赖清单

## 📦 运行时依赖

### Node.js 环境
- Node.js 24+
- pnpm 10+

### Python 环境
- Python 3.10+
- mediapipe 1.0.0

### 系统服务
- Ollama (LLM，本地或 WSL)
- PostgreSQL 15+ (数据库)
- Redis (可选，缓存)

---

## 🔧 开发依赖

### 必需
```bash
pnpm install
```

### 可选工具
- Docker (容器化部署)
- ngrok (本地隧道)
- nvm (Node版本管理)

---

## 📥 模型文件

### AI 模型
| 模型 | 大小 | 用途 |
|------|------|------|
| qwen2.5:7b | ~4GB | LLM 对话 |
| face_landmarker.task | ~3MB | 人脸情绪检测 |

### Live2D 模型
- 放置于 `data/models/` 目录
- 支持 .model3.json 格式

---

## 🌐 CDN 加速配置

### 推荐方案
1. **jsDelivr** - NPM 包加速
2. **unpkg** - NPM 包加速
3. **Statically** - Git 加速
4. **Cloudflare R2** - 自建对象存储

### 配置示例
```env
# CDN_BASE_URL=https://cdn.example.com
# MODEL_CDN_URL=https://models.example.com
```

---

## 🚀 启动清单

```bash
# 1. 安装依赖
pnpm install

# 2. 数据库迁移
cd apps/server && pnpm db:push

# 3. 启动服务
pnpm dev

# 或使用脚本
./start-services.bat
```

---

## 🔌 插件扩展

### 前端插件
- Live2D 模型包
- TTS 语音包
- 表情包资源

### 后端插件
- 自定义 AI Provider
- 记忆存储驱动
- 消息处理器
