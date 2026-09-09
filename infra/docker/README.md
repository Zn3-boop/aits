# Docker 基础设施配置

## 📁 目录结构

```
infra/docker/
├── docker-compose.yml    # 容器编排
├── app/
│   └── Dockerfile       # 后端应用镜像
├── web/
│   ├── Dockerfile       # 前端 Nginx 镜像
│   └── nginx.conf       # Nginx 配置
├── postgres/            # PostgreSQL 配置
└── redis/              # Redis 配置
```

## 🚀 快速启动

```bash
# 启动所有服务
cd infra/docker
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 📦 包含服务

| 服务 | 端口 | 说明 |
|------|------|------|
| PostgreSQL | 5432 | 数据库 |
| Redis | 6379 | 缓存 |
| Server | 8787 | 后端 API |
| Nginx | 80 | 前端静态服务 |

## 🔧 环境变量

在 `.env` 中配置：

```env
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=your-encryption-key
MODEL_PROVIDER=ollama
MODEL_BASE_URL=http://host.docker.internal:11434
MODEL_NAME=qwen2.5:7b
```

## 🏗️ 构建镜像

```bash
# 构建所有镜像
docker-compose build

# 仅构建后端
docker-compose build server
```
