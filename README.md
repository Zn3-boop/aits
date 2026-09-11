# LPM AI Companion System

基于 Monorepo 的 AI 陪伴系统，支持 Live2D 虚拟形象、智能对话、语音交互。

## 📁 项目结构

```
├── apps/
│   ├── web/                          # React 前端 (Vite + Zustand)
│   └── server/                       # Fastify 后端
│       └── src/
│           ├── routes/
│           │   ├── chats.ts          # 对话路由（调用双层摘要）
│           │   └── stt.ts            # 语音识别（Whisper）
│           ├── services/
│           │   ├── message-summary.ts # 双层摘要引擎（V2）
│           │   ├── memory-extractor.ts
│           │   ├── memory-recall.ts
│           │   └── affection.ts
│           ├── adapters/             # LLM/TTS 适配器
│           └── __tests__/            # Vitest 测试
├── packages/
│   ├── shared/        # 类型定义
│   ├── config/        # 配置文件
│   ├── llm-core/      # LLM 核心
│   ├── live2d-mapper/ # Live2D 映射
│   └── ui/            # UI 组件
├── tools/
│   └── emotion_service/  # 情绪检测
├── infra/
│   ├── docker/       # Docker 配置
│   └── nginx/        # Nginx 配置
└── docs/
```

## 🧠 核心架构

### 双层摘要压缩（Hierarchical Summarization）

长对话上下文采用从后往前的三层切分 + 重要度加权召回：

```
消息(老→新):  [═══ 远期 far ═══][═══ 近期 near ═══][ recent 原文 ]
                  │                    │                │
          按重要度选top50        往前30条窗口        尾部8条保留
          → 远期摘要(冻结)      → 近期摘要(每次重建)  → 原文不压缩
```

- **远期摘要**：切点固定，首次生成后基本永不重建，省 LLM 调用
- **近期摘要**：每次超限重新生成，覆盖较早几十轮，保持上下文连贯
- **重要度评分**：4 维度打分 — 信息量、偏好关键词命中、与近期话题词重叠、角色加权

设计双层摘要压缩策略，相比全量上下文方案，Token 压缩比达 89%（基于确定性估算函数验证）。

### 语音识别（STT）

仅保留 Whisper 本地引擎，启动时自动探测 `WHISPER_URL` 健康状态：

```
WHISPER_URL → /api/health 检测 → 就绪/未就绪
```

### 对话完整链路

```
用户发消息 → chats.ts
  ├─ prisma.personaConversation.findMany()  → 全部历史
  ├─ prisma.conversationSummary.findUnique() → 已存双层摘要
  ├─ compressConversationContextV2()         → 触发压缩？
  │   ├─ token ≤ 2500 或消息 ≤ 10？         → 直接放行
  │   └─ 超限 → 从后往前切分
  │       ├─ far: 按重要度选top50 → LLM摘要(冻结)
  │       ├─ near: 往前30条窗口  → LLM摘要(每次重建)
  │       └─ recent: 尾部8条原文保留
  ├─ prisma.conversationSummary.upsert()    → 异步持久化
  └─ 注入 system prompt → 送入 LLM
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

关键环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | SQLite 数据库路径 | `file:./dev.db` |
| `MODEL_PROVIDER` | LLM 提供商 | `ollama` |
| `MODEL_BASE_URL` | LLM 服务地址 | `http://127.0.0.1:11434` |
| `MODEL_NAME` | 模型名称 | `qwen2.5:7b` |
| `WHISPER_URL` | Whisper 语音识别服务 | `http://localhost:10095` |
| `EMOTION_SERVICE_URL` | 情绪检测服务 | `http://localhost:10096` |

### 3. 数据库迁移

```bash
cd apps/server
npx prisma db push
```

### 4. 启动服务

```bash
# 开发模式（前后端并行）
pnpm dev

# 生产模式
pnpm build
pnpm start
```

服务启动后：
- 前端：http://localhost:5173
- 后端 API：http://localhost:8787
- 健康检查：http://localhost:8787/api/health

## 🐳 Docker 部署

```bash
cd infra/docker
docker-compose up -d
```

## 📋 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React, TypeScript, Vite, Zustand |
| 后端 | Fastify, Prisma, SQLite |
| AI | Ollama / OpenAI 兼容, Edge TTS, MediaPipe |
| 语音 | Whisper (本地) |
| 测试 | Vitest |
| 部署 | Docker, Nginx, CI/CD |

## 🔧 常用命令

```bash
pnpm dev              # 开发模式
pnpm build            # 构建
pnpm test             # 测试
pnpm typecheck        # 类型检查
pnpm lint             # 代码检查
pnpm db:push          # 数据库同步
pnpm db:studio        # Prisma Studio 可视化
```

## 📚 文档

- [快速开始](docs/getting-started.md)
- [API 文档](docs/api/README.md)
- [部署指南](docs/deployment/README.md)
- [Monorepo 管理](docs/MONOREPO.md)
- [依赖清单](REQUIREMENTS.md)