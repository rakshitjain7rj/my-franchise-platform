/**
 * Shared (server-safe) helpers for product-category display.
 * Keep this free of "use client" so RSCs can call it.
 *
 * Note: Home “Curated by Flavor” no longer uses product categories — it uses
 * the fixed sponge list in curated-by-flavor. These helpers remain for
 * category filters / other surfaces that may set metadata.image_url.
 */

export type CategoryItem = {
  id: string;
  name: string;
  handle: string;
  imageSrc: string;
  href: string;
};

/**
 * Customer-facing category label.
 * Client prefers "Double High" over legacy DB name "Double Tall".
 */
export function displayCategoryName(
  cat: { name?: string | null; handle?: string | null } | null | undefined
): string {
  const handle = (cat?.handle ?? "").trim().toLowerCase()
  const name = (cat?.name ?? "").trim()
  if (
    handle === "double-tall-cakes" ||
    /double[\s-]*tall/i.test(name) ||
    /double[\s-]*high/i.test(name)
  ) {
    return "Double High Cakes"
  }
  return name
}

/** Short badge label (drops trailing "Cakes" / "Cake"). */
export function displayCategoryBadge(
  cat: { name?: string | null; handle?: string | null } | null | undefined
): string {
  const full = displayCategoryName(cat)
  if (!full) return ""
  if (
    (cat?.handle ?? "").toLowerCase() === "double-tall-cakes" ||
    /double[\s-]*(tall|high)/i.test(cat?.name ?? "")
  ) {
    return "Double High"
  }
  return full.replace(/ Cakes?$/i, "")
}

/**
 * Deterministic local placeholders when a category has no metadata image.
 * Reuses the three sponge studio shots (not flavour-accurate for arbitrary
 * categories — prefer setting metadata.image_url on each category).
 */
export const CATEGORY_PLACEHOLDER_IMAGES = [
  "/images/flavors/eggless-chocolate.jpg",
  "/images/flavors/eggless-vanilla.jpg",
  "/images/flavors/eggless-red-velvet.jpg",
] as const;

export function categoryImageFromMetadata(
  metadata:
    | { image_url?: string | null; thumbnail?: string | null }
    | null
    | undefined,
  index: number
): string {
  const fromMeta =
    (typeof metadata?.image_url === "string" && metadata.image_url.trim()) ||
    (typeof metadata?.thumbnail === "string" && metadata.thumbnail.trim()) ||
    "";
  if (fromMeta) return fromMeta;
  return CATEGORY_PLACEHOLDER_IMAGES[
    index % CATEGORY_PLACEHOLDER_IMAGES.length
  ];
}
