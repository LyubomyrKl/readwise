# syntax=docker/dockerfile:1.7
# Build from the repository root:  docker build -f apps/api/Dockerfile -t workbench-api .

FROM node:20-alpine AS base
WORKDIR /repo
# Native modules (argon2) compile when no prebuilt binary matches the platform.
RUN apk add --no-cache python3 make g++

# ---- all dependencies of the api workspace (dev included, for the build)
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
# postinstall generates the Prisma client
RUN npm ci --workspace apps/api --no-audit --no-fund

# ---- compile
FROM deps AS build
COPY apps/api apps/api
RUN npm run build --workspace apps/api

# ---- production dependencies only (prisma CLI stays: the entrypoint runs migrations)
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
RUN npm ci --workspace apps/api --omit=dev --no-audit --no-fund && mkdir -p apps/api/node_modules

# ---- runtime
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/api
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs
COPY --from=prod-deps --chown=nestjs:nodejs /repo/node_modules /repo/node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /repo/apps/api/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /repo/apps/api/dist ./dist
COPY --chown=nestjs:nodejs package.json /repo/package.json
COPY --chown=nestjs:nodejs apps/api/package.json apps/api/docker-entrypoint.sh ./
COPY --chown=nestjs:nodejs apps/api/prisma ./prisma
RUN chmod +x docker-entrypoint.sh
USER nestjs
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5173/api/health || exit 1
CMD ["./docker-entrypoint.sh"]
