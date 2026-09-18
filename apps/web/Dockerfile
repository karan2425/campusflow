# CampusFlow web app (Next.js) — multi-stage build.

# ---------------------------------------------------------------- deps/build
FROM node:20-alpine AS builder
WORKDIR /app

# All workspace manifests are required by `npm ci`; the shared package source is
# needed too because the app imports @campusflow/shared at build time.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspace @campusflow/web --include-workspace-root

COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

# The API origin is read at build time by next.config.ts for the rewrite() rules.
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=$API_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm --workspace @campusflow/web run build

# -------------------------------------------------------------------- runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/packages/shared ./packages/shared

WORKDIR /app/apps/web

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/login',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
