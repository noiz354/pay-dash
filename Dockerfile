# syntax=docker/dockerfile:1
# Reusable Dockerfile — NEXTJS_CONCEPTS.md #78 Self-hosted Docker/Node + #151 Turbopack + #106 Prisma
# 4-stage: base → deps → builder → runner (node:22-alpine, pnpm 9.12, standalone output)

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN corepack enable pnpm && corepack prepare pnpm@9.12.0 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM base AS builder
RUN corepack enable pnpm && corepack prepare pnpm@9.12.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
# Handle pnpm symlink for standalone: cp -rL ensures real files not symlinks
RUN pnpm --filter web exec prisma generate
RUN pnpm --filter web build
# pnpm standalone symlink fix
RUN cp -rL /app/apps/web/.next/standalone /app/standalone 2>/dev/null || cp -r /app/apps/web/.next/standalone /app/standalone

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
EXPOSE 3000

RUN apk add --no-cache curl \
 && addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/.next/standalone/apps/web ./apps/web
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p ./apps/web/public

USER nextjs
CMD ["node", "apps/web/server.js"]
