# LPM AI Companion System

基于 Monorepo 的 AI 陪伴系统，支持 Live2D 虚拟形象、智能对话、语音交互。

## 📁 项目结构

```
├── apps/               # 应用程序
│   ├── web/           # React 前端
│   └── server/        # Fastify 后端
├── packages/           # 共享包
│   ├── shared/        # 类型定义
│   ├── config/        # 配置文件
│   ├── llm-core/      # LLM 核心
│   ├── live2d-mapper/ # Live2D 映射
│   └── ui/            # UI 组件
├── tools/              # 工具服务
│   ├── emotion_service/  # 情绪检测
│   └── FunASR/          # 语音识别
├── infra/              # 基础设施
│   ├── docker/       # Docker 配置
│   └── nginx/        # Nginx 配置
└── docs/              # 文档
```

## 🚀 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境

```bash
copy .env.example .env
```

### 3. 数据库迁移

```bash
cd apps/server
pnpm prisma db push
```

### 4. 启动服务

```bash
# 开发模式
pnpm dev

# 生产模式
pnpm build
pnpm start
```

## 🐳 Docker 部署

```bash
cd infra/docker
docker-compose up -d
```

## 📋 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React, TypeScript, Vite, Zustand |
| 后端 | Fastify, Prisma, PostgreSQL |
| AI | Ollama, Edge TTS, MediaPipe |
| 部署 | Docker, Nginx, CI/CD |

## 📚 文档

- [快速开始](docs/getting-started.md)
- [API 文档](docs/api/README.md)
- [部署指南](docs/deployment/README.md)
- [Monorepo 管理](docs/MONOREPO.md)
- [依赖清单](REQUIREMENTS.md)

## 🔧 常用命令

```bash
pnpm dev          # 开发模式
pnpm build        # 构建
pnpm test         # 测试
pnpm typecheck    # 类型检查
pnpm lint         # 代码检查
```
