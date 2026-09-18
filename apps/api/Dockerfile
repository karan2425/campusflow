# CampusFlow API — multi-stage build.
# Build context is the repo root so the workspace lockfile + sibling workspaces
# are available to `npm ci`.

# ---------------------------------------------------------------- deps/build
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

# Every workspace package.json must be present or `npm ci` rejects the tree,
# because the root package.json declares all of them.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspace @campusflow/api --include-workspace-root

COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm --workspace @campusflow/api run build

# -------------------------------------------------------------------- runtime
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/shared ./packages/shared

WORKDIR /app/apps/api

EXPOSE 4000

# Container-level health probe hitting the API's own /health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
