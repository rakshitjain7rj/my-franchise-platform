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
    base="${script%.*}"
    path=""
    for candidate in \
      "./src/scripts/${script}" \
      "./src/scripts/${base}.js" \
      "./src/scripts/${base}.ts"
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
    if npx medusa exec "${path}"; then
      echo "[entrypoint] OK: ${path}"
    else
      echo "[entrypoint] WARNING: seed script '${path}' failed; continuing." >&2
    fi
  done
else
  echo "[entrypoint] RUN_SEED not set to 'true'; skipping seed."
fi

echo "[entrypoint] Starting Medusa server on :9000..."
exec npx medusa start
