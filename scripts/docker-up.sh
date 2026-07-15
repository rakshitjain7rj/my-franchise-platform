#!/usr/bin/env bash
# =============================================================================
# Build & run the Docker stack so phones on the same Wi‑Fi can open it.
#
# Usage:
#   ./scripts/docker-up.sh              # detect LAN IP, rebuild, start
#   ./scripts/docker-up.sh -d           # same, detached
#   HOST_LAN_IP=192.168.1.10 ./scripts/docker-up.sh
#
# On your phone (same Wi‑Fi):
#   Storefront  →  http://<LAN_IP>:3000
#   Admin       →  http://<LAN_IP>:9000/app
#
# NEXT_PUBLIC_* is baked into the storefront image at build time, so this
# script rewrites .env.docker and runs `docker compose up --build`.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env.docker"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "Copy from .env.docker.example (or restore your local .env.docker) first."
  exit 1
fi

detect_lan_ip() {
  # IP used to reach the internet = Wi‑Fi/Ethernet LAN address (not docker bridges).
  ip -4 route get 1.1.1.1 2>/dev/null \
    | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }'
}

LAN_IP="${HOST_LAN_IP:-$(detect_lan_ip)}"
if [[ -z "${LAN_IP}" ]]; then
  echo "Could not detect LAN IP. Export HOST_LAN_IP=192.168.x.x and retry."
  exit 1
fi

# Set or replace KEY=value in .env.docker (value may contain : / , etc.)
set_env() {
  local key="$1"
  local val="$2"
  if grep -qE "^${key}=" "${ENV_FILE}"; then
    # Escape & \ for sed replacement; use | as delimiter.
    local escaped
    escaped="$(printf '%s' "${val}" | sed -e 's/[\\&|]/\\&/g')"
    sed -i "s|^${key}=.*|${key}=${escaped}|" "${ENV_FILE}"
  else
    printf '\n%s=%s\n' "${key}" "${val}" >> "${ENV_FILE}"
  fi
}

STORE_ORIGIN="http://${LAN_IP}:3000"
BACKEND_ORIGIN="http://${LAN_IP}:9000"

set_env HOST_LAN_IP "${LAN_IP}"
# Browser (phone) must call the host IP, never http://backend:9000 or localhost.
set_env NEXT_PUBLIC_MEDUSA_BACKEND_URL "${BACKEND_ORIGIN}"
set_env STORE_CORS "http://localhost:3000,http://localhost:8000,${STORE_ORIGIN}"
set_env ADMIN_CORS "http://localhost:9000,http://localhost:5173,${BACKEND_ORIGIN}"
set_env AUTH_CORS "http://localhost:3000,http://localhost:9000,http://localhost:5173,http://localhost:8000,${STORE_ORIGIN},${BACKEND_ORIGIN}"

echo ""
echo "LAN IP: ${LAN_IP}"
echo "  Storefront (phone): ${STORE_ORIGIN}"
echo "  Backend / Admin:    ${BACKEND_ORIGIN}/app"
echo ""
echo "Rewrote CORS + NEXT_PUBLIC_MEDUSA_BACKEND_URL in .env.docker"
echo "Building and starting (storefront rebuild applies the new public URL)…"
echo ""

cd "${ROOT}"
exec docker compose --env-file .env.docker up --build "$@"
