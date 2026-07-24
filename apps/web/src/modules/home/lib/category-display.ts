/**
 * Shared (server-safe) helpers for home-page category circles.
 * Keep this free of "use client" so RSCs can call it.
 */

export type CategoryItem = {
  id: string;
  name: string;
  handle: string;
  imageSrc: string;
  href: string;
};

/** Deterministic local placeholders when a category has no metadata image. */
export const CATEGORY_PLACEHOLDER_IMAGES = [
  "/images/flavors/red-velvet.png",
  "/images/flavors/dark-truffle.png",
  "/images/flavors/madagascar-vanilla.png",
  "/images/flavors/blueberry-silk.png",
  "/images/flavors/summer-harvest.png",
  "/images/flavors/gold-butterscotch.png",
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
