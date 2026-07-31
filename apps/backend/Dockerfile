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
# Make npm resilient to slow/stalled registry fetches and rate limits (E429):
#   - disable audit/fund network round-trips
#   - retry transient failures with bounded backoff
#   - cap a single socket stall so it retries rather than freezing the build
# npm's own fetch_retries help for per-package GETs; Dockerfile steps below
# also wrap full `npm install`/`npm ci` in shell retries for whole-command 429s.
ENV npm_config_audit=false \
    npm_config_fund=false \
    npm_config_fetch_retries=10 \
    npm_config_fetch_retry_factor=3 \
    npm_config_fetch_retry_mintimeout=5000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=300000 \
    npm_config_maxsockets=5
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
# Retry whole-command failures (registry E429 is common on shared CI IPs).
RUN --mount=type=cache,target=/root/.npm \
    set -eux; \
    attempt=1; max=8; \
    while [ "$attempt" -le "$max" ]; do \
      if npm ci --no-audit --no-fund --prefer-offline; then exit 0; fi; \
      echo "npm ci failed (attempt ${attempt}/${max}); backing off…"; \
      sleep $((attempt * 30)); \
      attempt=$((attempt + 1)); \
    done; \
    echo "npm ci failed after ${max} attempts"; exit 1

# 2) Bring in the pruned source and build.
COPY --from=pruner /app/out/full/ ./
RUN turbo run build --filter=@dtc/backend

# 3) `medusa build` emits a fully self-contained server in
#    apps/backend/.medusa/server (it has its OWN package.json). Install its
#    production-only dependencies so the runner stage can stay lean.
#    This step is the usual E429 failure point (~1100 packages); prefer-offline
#    reuses the BuildKit npm cache, and the loop retries after registry cool-down.
WORKDIR /app/apps/backend/.medusa/server
RUN --mount=type=cache,target=/root/.npm \
    set -eux; \
    attempt=1; max=10; \
    while [ "$attempt" -le "$max" ]; do \
      if npm install --omit=dev --no-audit --no-fund --legacy-peer-deps --prefer-offline; then \
        exit 0; \
      fi; \
      echo "npm install (.medusa/server) failed (attempt ${attempt}/${max}); backing off…"; \
      sleep $((attempt * 45)); \
      attempt=$((attempt + 1)); \
    done; \
    echo "npm install (.medusa/server) failed after ${max} attempts"; exit 1


###############################################################################
# Stage 3 — runner: minimal Debian (slim) image that runs the compiled server
###############################################################################
FROM node:20-slim AS runner
# gosu: entrypoint starts as root to chown the volume-mounted /app/static,
# then drops to the medusa user for migrations + server.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates gosu \
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

# Migrations + start are orchestrated by the entrypoint (runs as root first).
COPY apps/backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Local file provider writes to ./static (public uploads / product images /
# hero banners). Image-layer default; a named volume mount replaces this at
# runtime and the entrypoint re-chowns it for the medusa user.
RUN mkdir -p /app/static \
 && chown -R medusa:medusa /app/static

# Stay root so the entrypoint can fix volume ownership, then gosu → medusa.
USER root
EXPOSE 9000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
