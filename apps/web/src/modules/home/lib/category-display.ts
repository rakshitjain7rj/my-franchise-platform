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
