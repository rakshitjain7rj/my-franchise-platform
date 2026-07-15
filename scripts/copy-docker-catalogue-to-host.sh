#!/usr/bin/env bash
# =============================================================================
# Copy Docker catalogue (products, variants, categories, dietary, prices,
# inventory items, images, franchise links) into the host Postgres DB.
#
# Does NOT copy inventory_level (Docker stock location IDs differ). After the
# copy, run repair-host-store-stock-inventory.ts to stock every host store.
#
# Remaps:
#   product_sales_channel.sales_channel_id  → host Default Sales Channel
#   product_shipping_profile.shipping_profile_id → host default shipping profile
#
# Prerequisites:
#   - Docker stack running (db container healthy)
#   - Host Postgres cake-project-database reachable
#   - Host synthetic products already soft-deleted (or handles free)
#
# Usage:
#   ./scripts/copy-docker-catalogue-to-host.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_DB_CONTAINER="${DOCKER_DB_CONTAINER:-my-franchise-platform-db-1}"
DOCKER_DB_USER="${DOCKER_DB_USER:-medusa}"
DOCKER_DB_NAME="${DOCKER_DB_NAME:-medusa-db}"
HOST_DB_URL="${HOST_DB_URL:-postgres://postgres@localhost/cake-project-database}"
DUMP_DIR="${DUMP_DIR:-/tmp/cake-catalogue-copy}"
mkdir -p "${DUMP_DIR}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Copy Docker catalogue → host Postgres"
echo "  Docker: ${DOCKER_DB_CONTAINER}/${DOCKER_DB_NAME}"
echo "  Host:   ${HOST_DB_URL}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Tables in FK-safe order (parents before children). Skip inventory_level.
TABLES=(
  dietary_tag
  product_category
  product_collection
  product_type
  product_tag
  product
  image
  product_option
  product_option_value
  product_variant
  product_variant_option
  product_category_product
  product_tags
  price_set
  price
  product_variant_price_set
  inventory_item
  product_variant_inventory_item
  product_sales_channel
  product_shipping_profile
  franchise_franchise_product_product
  product_product_dietary_tag_dietary_tag
)

# Resolve host remap targets
HOST_SC_ID="$(psql "${HOST_DB_URL}" -t -A -c "SELECT id FROM sales_channel WHERE name = 'Default Sales Channel' LIMIT 1;")"
HOST_SP_ID="$(psql "${HOST_DB_URL}" -t -A -c "SELECT id FROM shipping_profile ORDER BY created_at ASC LIMIT 1;")"
HOST_FRAN_ID="$(psql "${HOST_DB_URL}" -t -A -c "SELECT id FROM franchise LIMIT 1;")"

if [[ -z "${HOST_SC_ID}" || -z "${HOST_SP_ID}" || -z "${HOST_FRAN_ID}" ]]; then
  echo "ERROR: Could not resolve host sales_channel / shipping_profile / franchise." >&2
  exit 1
fi

DOCKER_SC_ID="$(docker exec "${DOCKER_DB_CONTAINER}" psql -U "${DOCKER_DB_USER}" -d "${DOCKER_DB_NAME}" -t -A -c "SELECT id FROM sales_channel LIMIT 1;")"
DOCKER_SP_ID="$(docker exec "${DOCKER_DB_CONTAINER}" psql -U "${DOCKER_DB_USER}" -d "${DOCKER_DB_NAME}" -t -A -c "SELECT id FROM shipping_profile ORDER BY created_at ASC LIMIT 1;")"
DOCKER_FRAN_ID="$(docker exec "${DOCKER_DB_CONTAINER}" psql -U "${DOCKER_DB_USER}" -d "${DOCKER_DB_NAME}" -t -A -c "SELECT id FROM franchise LIMIT 1;")"

echo "Host SC=${HOST_SC_ID}  SP=${HOST_SP_ID}  FRAN=${HOST_FRAN_ID}"
echo "Docker SC=${DOCKER_SC_ID}  SP=${DOCKER_SP_ID}  FRAN=${DOCKER_FRAN_ID}"

# Soft-delete host categories + dietary tags so Docker handles/slugs import cleanly
echo ""
echo "[1/5] Soft-deleting active host categories & dietary tags (replaced by Docker set)..."
psql "${HOST_DB_URL}" -v ON_ERROR_STOP=1 -c "
UPDATE product_category SET deleted_at = NOW(), updated_at = NOW()
WHERE deleted_at IS NULL;
DELETE FROM product_category_product
WHERE product_category_id IN (SELECT id FROM product_category WHERE deleted_at IS NOT NULL);
UPDATE dietary_tag SET deleted_at = NOW(), updated_at = NOW()
WHERE deleted_at IS NULL;
"

# Dump each table from Docker
echo ""
echo "[2/5] Dumping tables from Docker..."
TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=(-t "$t")
done

docker exec "${DOCKER_DB_CONTAINER}" pg_dump \
  -U "${DOCKER_DB_USER}" \
  -d "${DOCKER_DB_NAME}" \
  --data-only \
  --column-inserts \
  --no-owner \
  --no-privileges \
  "${TABLE_ARGS[@]}" \
  > "${DUMP_DIR}/catalogue.sql"

echo "  Dump size: $(wc -c < "${DUMP_DIR}/catalogue.sql") bytes"

# Rewrite sales channel / shipping profile / franchise IDs in the dump
echo ""
echo "[3/5] Remapping sales channel, shipping profile, franchise IDs in dump..."
# Use python for safe string replace of IDs
python3 - <<PY
from pathlib import Path
p = Path("${DUMP_DIR}/catalogue.sql")
text = p.read_text()
replacements = {
    "${DOCKER_SC_ID}": "${HOST_SC_ID}",
    "${DOCKER_SP_ID}": "${HOST_SP_ID}",
}
# Franchise IDs happen to match today, but remap if they ever diverge.
if "${DOCKER_FRAN_ID}" != "${HOST_FRAN_ID}":
    replacements["${DOCKER_FRAN_ID}"] = "${HOST_FRAN_ID}"
for old, new in replacements.items():
    if old and new and old != new:
        text = text.replace(old, new)
        print(f"  replaced {old} → {new}")
p.write_text(text)
print("  rewrite complete")
PY

# Import
echo ""
echo "[4/5] Importing into host (ON CONFLICT DO NOTHING style via session)..."
# Use a transaction; if a row already exists, fail loudly so we can investigate.
# For dietary_tag / product_category we already soft-deleted conflicts.
psql "${HOST_DB_URL}" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
-- Speed + defer FK checks where possible
SET session_replication_role = replica;
\i ${DUMP_DIR}/catalogue.sql
SET session_replication_role = DEFAULT;
COMMIT;
SQL

echo ""
echo "[5/5] Summary on host..."
psql "${HOST_DB_URL}" -c "
SELECT 'active_products' k, COUNT(*)::text FROM product WHERE deleted_at IS NULL
UNION ALL SELECT 'active_variants', COUNT(*)::text FROM product_variant WHERE deleted_at IS NULL
UNION ALL SELECT 'categories', COUNT(*)::text FROM product_category WHERE deleted_at IS NULL
UNION ALL SELECT 'category_links', COUNT(*)::text FROM product_category_product
UNION ALL SELECT 'dietary_tags', COUNT(*)::text FROM dietary_tag WHERE deleted_at IS NULL
UNION ALL SELECT 'dietary_links', COUNT(*)::text FROM product_product_dietary_tag_dietary_tag WHERE deleted_at IS NULL
UNION ALL SELECT 'images', COUNT(*)::text FROM image WHERE deleted_at IS NULL
UNION ALL SELECT 'prices', COUNT(*)::text FROM price WHERE deleted_at IS NULL
UNION ALL SELECT 'inventory_items', COUNT(*)::text FROM inventory_item WHERE deleted_at IS NULL
UNION ALL SELECT 'franchise_product_links', COUNT(*)::text FROM franchise_franchise_product_product WHERE deleted_at IS NULL
UNION ALL SELECT 'scraped_products', COUNT(*)::text FROM product WHERE deleted_at IS NULL AND metadata ? 'scraped_source'
UNION ALL SELECT 'with_ingredients_meta', COUNT(*)::text FROM product WHERE deleted_at IS NULL AND metadata ? 'ingredients'
UNION ALL SELECT 'with_storage_serving', COUNT(*)::text FROM product WHERE deleted_at IS NULL AND metadata ? 'storage_serving';
"

echo ""
echo "✅ Catalogue copy complete."
echo "Next:"
echo "  cd apps/backend && npx medusa exec ./src/scripts/one-off/repair-host-store-stock-inventory.ts"
echo "  (creates inventory levels at every host store stock location)"
echo "Optional polish:"
echo "  npx medusa exec ./src/scripts/one-off/scrape-live-ingredients-allergens.ts"
echo "  npx medusa exec ./src/scripts/seed-cake-categories.ts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
