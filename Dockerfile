# Edvora web (Next.js 16 + Payload 3) — production image for container hosts (Railway demo; Iranian hosts later).
# Multi-stage: install with pnpm, build with Turborepo, ship only Next's standalone output.
# Payload applies committed migrations on boot (prodMigrations), so no separate migrate step is needed.

ARG NODE_VERSION=24.22.2

FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/core/package.json packages/core/
COPY packages/integrations/package.json packages/integrations/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Build-time placeholders only: pages are rendered per request, real values come from the host at runtime.
ENV NODE_ENV=production \
    DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    PAYLOAD_SECRET=build-time-placeholder \
    SESSION_SECRET=build-time-placeholder
RUN pnpm --filter @edvora/web build

FROM node:${NODE_VERSION}-slim AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p apps/web/public apps/web/media && chown -R nextjs:nodejs apps/web/public apps/web/media
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
