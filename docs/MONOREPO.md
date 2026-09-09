# Monorepo 管理规范

## 📁 目录结构

```
aits.1/
├── apps/                    # 应用程序
│   ├── web/               # React 前端
│   └── server/            # Fastify 后端
├── packages/               # 共享包
│   ├── shared/            # 共享类型和工具
│   ├── config/            # 共享配置
│   ├── llm-core/          # LLM 核心模块
│   ├── live2d-mapper/     # Live2D 映射器
│   └── ui/                # UI 组件库
├── tools/                  # 工具脚本
│   ├── emotion_service/   # 情绪检测服务
│   └── FunASR/           # 语音识别工具
├── infra/                  # 基础设施
│   ├── docker/           # Docker 配置
│   └── nginx/            # Nginx 配置
└── data/                  # 数据目录
```

## 🎯 核心原则

### 1. 包依赖管理
```bash
# ✅ 推荐：引用 workspace 包
pnpm add @lpm/shared --filter @lpm/web

# ❌ 避免：直接跨包引用文件
# 不应该：import from ../../../packages/shared
```

### 2. 共享代码
- 类型定义 → `packages/shared`
- 配置 → `packages/config`
- UI 组件 → `packages/ui`

### 3. 环境变量
- 根目录 `.env` 定义共享变量
- `apps/*/.env` 定义应用特定变量
- 使用 `dotenv` 或 `@dotenvx/dotenvx` 加载

## 🔧 常用命令

```bash
# 安装所有依赖
pnpm install

# 构建所有包
pnpm build

# 开发所有应用
pnpm dev

# 构建特定应用
pnpm --filter @lpm/web build
pnpm --filter @lpm/server build

# 类型检查
pnpm typecheck

# 运行测试
pnpm test
```

## 📦 工作区配置

### apps/web/package.json
```json
{
  "dependencies": {
    "@lpm/shared": "workspace:*",
    "@lpm/ui": "workspace:*"
  }
}
```

### apps/server/package.json
```json
{
  "dependencies": {
    "@lpm/shared": "workspace:*",
    "@lpm/llm-core": "workspace:*"
  }
}
```

## 🚀 部署流程

### 1. 构建阶段
```bash
pnpm build              # 构建所有
pnpm --filter @lpm/web build
pnpm --filter @lpm/server build
```

### 2. 测试阶段
```bash
pnpm test              # 运行所有测试
pnpm typecheck         # 类型检查
pnpm lint             # 代码检查
```

### 3. 部署阶段
```bash
# Docker 部署
docker-compose up -d

# 或手动部署
pnpm --filter @lpm/server start
```

## 🔌 扩展点

### 添加新包
```bash
# 1. 创建包目录
mkdir -p packages/my-package

# 2. 添加 package.json
echo '{"name": "@lpm/my-package", "version": "0.1.0"}' > packages/my-package/package.json

# 3. 在 workspace 中注册
pnpm install
```

### 添加新应用
```bash
# 1. 创建应用目录
mkdir -p apps/my-app

# 2. 初始化应用
cd apps/my-app
pnpm init
```

## 📝 规范检查

### CI 检查项
- [ ] 类型检查通过
- [ ] Lint 检查通过
- [ ] 测试通过
- [ ] 构建成功

### 提交规范
```bash
# feat: 新功能
# fix: 修复
# docs: 文档
# refactor: 重构
# test: 测试
# chore: 杂项
```
