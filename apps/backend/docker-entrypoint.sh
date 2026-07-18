#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Medusa v2 container entrypoint
#
# Compose gates startup on `db: service_healthy`, so Postgres is reachable by
# the time we get here. Order of operations:
#   1. Migrate the schema (idempotent, every boot).
#   2. Optionally seed data ONCE on first boot (RUN_SEED=true).
#   3. Start the server.
# ---------------------------------------------------------------------------

echo "[entrypoint] Running database migrations..."
npx medusa db:migrate

# Optional one-time data seeding.
#   - Enable on first boot:  RUN_SEED=true
#   - Then set it back to false so subsequent boots don't duplicate data.
#   - Order matters: seed-catalogue requires the franchise seed first. Override
#     the list/order via SEED_SCRIPTS (comma- or space-separated, names only).
if [ "${RUN_SEED}" = "true" ]; then
  SEED_SCRIPTS="${SEED_SCRIPTS:-seed-franchise-data.ts seed-catalogue.ts}"
  echo "[entrypoint] RUN_SEED=true -> seeding: ${SEED_SCRIPTS}"
  for script in $(echo "$SEED_SCRIPTS" | tr ',' ' '); do
    # Production image (medusa build) ships compiled .js under src/scripts/,
    # not TypeScript. Local dev uses .ts. Resolve whichever exists.
    # Supports nested paths e.g. one-off/backfill-inventory-items.ts
    base="${script%.*}"
    path=""
    for candidate in \
      "./src/scripts/${script}" \
      "./src/scripts/${base}.js" \
      "./src/scripts/${base}.ts" \
      "./src/scripts/one-off/${script}" \
      "./src/scripts/one-off/${base}.js" \
      "./src/scripts/one-off/${base}.ts"
    do
      if [ -f "${candidate}" ]; then
        path="${candidate}"
        break
      fi
    done
    if [ -z "${path}" ]; then
      echo "[entrypoint] WARNING: seed script '${script}' not found under src/scripts/; skipping." >&2
      continue
    fi
    echo "[entrypoint] Seeding: ${path}"
    # Catalogue bootstrap is long-running; do not abort the whole container on
    # a soft failure unless MEDUSA_SEED_STRICT=true.
    if npx medusa exec "${path}"; then
      echo "[entrypoint] OK: ${path}"
    else
      if [ "${MEDUSA_SEED_STRICT}" = "true" ]; then
        echo "[entrypoint] ERROR: seed script '${path}' failed (MEDUSA_SEED_STRICT=true)." >&2
        exit 1
      fi
      echo "[entrypoint] WARNING: seed script '${path}' failed; continuing." >&2
    fi
  done
else
  echo "[entrypoint] RUN_SEED not set to 'true'; skipping seed."
fi

# Optional one-shot admin bootstrap (set via Dokploy env, then clear after first boot).
#   CREATE_ADMIN_EMAIL=you@example.com
#   CREATE_ADMIN_PASSWORD=a-strong-password
# Safe to leave empty. If the user already exists, medusa user exits non-zero —
# we swallow that so restarts remain healthy.
if [ -n "${CREATE_ADMIN_EMAIL:-}" ] && [ -n "${CREATE_ADMIN_PASSWORD:-}" ]; then
  echo "[entrypoint] Creating admin user: ${CREATE_ADMIN_EMAIL}"
  if npx medusa user -e "${CREATE_ADMIN_EMAIL}" -p "${CREATE_ADMIN_PASSWORD}"; then
    echo "[entrypoint] Admin user created (or already ready)."
  else
    echo "[entrypoint] WARNING: medusa user failed (user may already exist); continuing." >&2
  fi
fi

# Optional one-shot super-admin grant (metadata.is_super_admin = true).
#   MAKE_SUPER_ADMIN_EMAIL=you@example.com
# Clear after first successful boot. Idempotent if already super-admin.
if [ -n "${MAKE_SUPER_ADMIN_EMAIL:-}" ]; then
  echo "[entrypoint] Granting super-admin to: ${MAKE_SUPER_ADMIN_EMAIL}"
  path=""
  for candidate in \
    "./src/scripts/make-user-super-admin.js" \
    "./src/scripts/make-user-super-admin.ts"
  do
    if [ -f "${candidate}" ]; then
      path="${candidate}"
      break
    fi
  done
  if [ -z "${path}" ]; then
    echo "[entrypoint] WARNING: make-user-super-admin script not found; skipping." >&2
  # Script reads MAKE_SUPER_ADMIN_EMAIL from the environment (set above).
  elif npx medusa exec "${path}"; then
    echo "[entrypoint] Super-admin grant OK."
  else
    echo "[entrypoint] WARNING: super-admin grant failed; continuing." >&2
  fi
fi

echo "[entrypoint] Starting Medusa server on :9000..."
exec npx medusa start
