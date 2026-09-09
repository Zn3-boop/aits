# 构建阶段
FROM node:24-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

# 复制 package 文件
COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源码
COPY . .

# 构建
RUN pnpm --filter @lpm/server build
RUN pnpm --filter @lpm/web build

# 运行阶段
FROM node:24-alpine AS runner

WORKDIR /app

# 安装依赖
RUN corepack enable && corepack prepare pnpm@10 --activate

# 复制构建产物
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma

# 复制数据目录
COPY --from=builder /app/data ./data

# 暴露端口
EXPOSE 8787

# 启动命令
CMD ["node", "apps/server/dist/index.js"]
