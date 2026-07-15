# syntax=docker/dockerfile:1

###############################################################################
# Medusa v2 backend (@dtc/backend) — multi-stage Turborepo build
#
# Build context MUST be the repository root, e.g.:
#   docker build -f apps/backend/Dockerfile -t dtc-backend .
# (docker-compose.yml already sets `context: .` for this reason.)
###############################################################################

###############################################################################
# Stage 0 — base: shared Node + Turbo toolchain
#
# NOTE: Debian (slim), NOT Alpine. Medusa's runtime hangs on musl/Alpine
# (e.g. `medusa db:migrate` deadlocks); the official guidance is a
# glibc/Debian-based Node image.
###############################################################################
FROM node:20-slim AS base
# openssl + ca-certificates: required by Medusa / its DB drivers at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Make npm resilient to slow/stalled registry fetches instead of hanging:
#   - disable audit/fund network round-trips
#   - retry transient failures with bounded backoff
#   - cap a single socket stall so it retries rather than freezing the build
ENV npm_config_audit=false \
    npm_config_fund=false \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=2000 \
    npm_config_fetch_retry_maxtimeout=60000 \
    npm_config_fetch_timeout=120000
RUN npm install -g turbo@^2.0.14
WORKDIR /app


###############################################################################
# Stage 1 — pruner: isolate just what @dtc/backend needs
#   `turbo prune` emits:
#     out/json/            -> package.json files only (great layer caching)
#     out/full/            -> full source for the pruned workspaces
#     out/package-lock.json-> pruned npm lockfile
###############################################################################
FROM base AS pruner
COPY . .
RUN turbo prune @dtc/backend --docker


###############################################################################
# Stage 2 — builder: install deps, compile, prepare the runnable server
###############################################################################
FROM base AS builder
WORKDIR /app

# 1) Install dependencies from the pruned lockfile first (maximises caching:
#    this layer only busts when a package.json or the lockfile changes).
#    A persistent BuildKit cache mount for npm's cache means re-runs reuse
#    already-downloaded tarballs instead of re-fetching the world.
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# 2) Bring in the pruned source and build.
COPY --from=pruner /app/out/full/ ./
RUN turbo run build --filter=@dtc/backend

# 3) `medusa build` emits a fully self-contained server in
#    apps/backend/.medusa/server (it has its OWN package.json). Install its
#    production-only dependencies so the runner stage can stay lean.
WORKDIR /app/apps/backend/.medusa/server
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --no-audit --no-fund --legacy-peer-deps


###############################################################################
# Stage 3 — runner: minimal Debian (slim) image that runs the compiled server
###############################################################################
FROM node:20-slim AS runner
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app

# Run as an unprivileged user WITH a writable home directory: the Medusa CLI
# uses `configstore` ($HOME/.config/medusa) on startup, so a missing/unwritable
# home makes `medusa db:migrate` crash with EACCES (and hang on musl).
RUN groupadd --system --gid 1001 medusa \
 && useradd  --system --uid 1001 --gid medusa --create-home --home-dir /home/medusa medusa
ENV HOME=/home/medusa

# The self-contained build output is everything we need at runtime.
COPY --from=builder --chown=medusa:medusa /app/apps/backend/.medusa/server ./

# Migrations + start are orchestrated by the entrypoint.
COPY --chown=medusa:medusa apps/backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER medusa
EXPOSE 9000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
