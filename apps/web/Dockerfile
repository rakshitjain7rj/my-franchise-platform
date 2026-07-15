# syntax=docker/dockerfile:1

###############################################################################
# Next.js storefront (@dtc/storefront) — multi-stage Turborepo build
#
# Build context MUST be the repository root, e.g.:
#   docker build -f apps/web/Dockerfile -t dtc-storefront .
# (docker-compose.yml already sets `context: .` for this reason.)
#
# NOTE: NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time,
# so they are passed as build args (see docker-compose.yml).
###############################################################################

###############################################################################
# Stage 0 — base: shared Node + Turbo toolchain
###############################################################################
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g turbo@^2.0.14
WORKDIR /app


###############################################################################
# Stage 1 — pruner: isolate just what @dtc/storefront needs
###############################################################################
FROM base AS pruner
COPY . .
RUN turbo prune @dtc/storefront --docker


###############################################################################
# Stage 2 — builder: install deps and produce the standalone bundle
###############################################################################
FROM base AS builder
WORKDIR /app

# Install from the pruned lockfile first for maximum layer caching.
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm ci

# Public, build-time-inlined configuration.
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_DEFAULT_FRANCHISE_ID
ARG NEXT_PUBLIC_PAYPAL_CLIENT_ID
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL
ENV NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_DEFAULT_FRANCHISE_ID=$NEXT_PUBLIC_DEFAULT_FRANCHISE_ID
ENV NEXT_PUBLIC_PAYPAL_CLIENT_ID=$NEXT_PUBLIC_PAYPAL_CLIENT_ID
ENV NEXT_TELEMETRY_DISABLED=1

# Bring in the pruned source and build the standalone output.
COPY --from=pruner /app/out/full/ ./
RUN turbo run build --filter=@dtc/storefront


###############################################################################
# Stage 3 — runner: minimal Alpine image serving the standalone server
###############################################################################
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# `output: 'standalone'` + outputFileTracingRoot produces a monorepo-aware
# bundle: the server entrypoint lives at apps/web/server.js and ships its own
# minimal node_modules. Static assets and /public are copied alongside it.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
