import type { MedusaProduct } from "./types";

/**
 * Pick the longest useful product blurb for display.
 * Many Magento imports only stored a short overview/title; longer marketing
 * copy often lives in metadata from the live scrape.
 */
export function resolveFullProductDescription(product: MedusaProduct): string {
  const title = (product.title || "").trim();
  const titleBare = title.replace(/^\([^)]+\)\s*/, "").trim();
  const meta = product.metadata ?? {};

  const candidates = [
    product.description,
    typeof meta.scraped_meta_description === "string"
      ? meta.scraped_meta_description
      : null,
    typeof meta.scraped_overview === "string" ? meta.scraped_overview : null,
    product.subtitle,
  ]
    .map((s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : ""))
    .filter((s) => {
      if (!s || s.length < 20) return false;
      if (/^allergens?\s*:/i.test(s)) return false;
      if (s === title || s === titleBare) return false;
      return true;
    });

  if (!candidates.length) {
    return (product.description || "").trim();
  }

  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

/** Full product description — under the gallery on desktop; after CTA on mobile. */
export function ProductDescription({
  description,
  className = "",
  headingId = "product-description-heading",
}: {
  description: string;
  className?: string;
  headingId?: string;
}) {
  const normalized = description.trim().replace(/\s+/g, " ");
  const paragraphs = normalized
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((para) => para.trim())
    .filter(Boolean);

  const blocks =
    paragraphs.length > 0
      ? paragraphs
      : description
          .trim()
          .split(/\n+/)
          .map((para) => para.trim())
          .filter(Boolean);

  if (!blocks.length) return null;

  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-3xl border border-outline-variant/20 bg-[#FBF5FB] p-6 md:p-8 shadow-sm ${className}`}
    >
      <h2
        id={headingId}
        className="font-headline-md text-sm uppercase tracking-[0.18em] text-deep-plum mb-4"
      >
        About this cake
      </h2>
      <div className="space-y-4 font-body-md text-on-surface leading-relaxed text-base md:text-[17px]">
        {blocks.map((para, i) => (
          <p key={i} className="text-pretty">
            {para}
          </p>
        ))}
      </div>
    </section>
  );
}
