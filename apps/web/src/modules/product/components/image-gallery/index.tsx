"use client";

import { useState, useCallback, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductImage {
  url: string;
  alt?: string;
}

interface ImageGalleryProps {
  images: ProductImage[];
  productTitle: string;
}

/** Shared max height for hero — tall photos letterbox/scale inside this, never crop. */
const HERO_MAX_H_CLASS = "max-h-[min(85vh,720px)]";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Hero gallery with an adaptive box:
 * - Pre-load: square skeleton (full column width)
 * - After load: box snaps to the photo’s natural aspect; image is as large as
 *   the column allows without crop (max-height cap for very tall assets)
 * - Lightbox: viewport-first contain (~90vw / 90vh)
 */
export default function ImageGallery({
  images,
  productTitle,
}: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const heroImgRef = useRef<HTMLImageElement | null>(null);

  const hasImages = images.length > 0;
  const currentImage = hasImages ? images[selectedIndex] : null;
  const heroUrl = currentImage?.url ?? null;

  const markHeroReady = useCallback((img: HTMLImageElement | null) => {
    if (!img) return;
    // Natural dimensions available → layout can hug the image (adaptive box).
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setHeroLoaded(true);
    } else {
      setHeroLoaded(true);
    }
  }, []);

  // Reset when the active hero URL changes; handle cached images (complete).
  useEffect(() => {
    if (!heroUrl) {
      setHeroLoaded(false);
      return;
    }
    setHeroLoaded(false);
    // Defer so the new img node is mounted with this URL.
    const id = requestAnimationFrame(() => {
      const img = heroImgRef.current;
      if (img && img.complete && img.naturalWidth > 0) {
        markHeroReady(img);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [heroUrl, markHeroReady]);

  const goTo = useCallback(
    (index: number) => {
      setSelectedIndex(
        ((index % images.length) + images.length) % images.length
      );
    },
    [images.length]
  );

  const prev = useCallback(() => goTo(selectedIndex - 1), [goTo, selectedIndex]);
  const next = useCallback(() => goTo(selectedIndex + 1), [goTo, selectedIndex]);

  // ── No images placeholder ─────────────────────────────────────────────
  if (!hasImages) {
    return (
      <div className="aspect-square rounded-2xl bg-lavender-bg flex items-center justify-center">
        <span className="material-symbols-outlined text-deep-plum/20 !text-[96px]">
          cake
        </span>
      </div>
    );
  }

  return (
    <>
      {/* ── Main image ──────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Full-column flex host so max-w-% on the photo resolves correctly. */}
        <div className="flex w-full min-w-0 justify-center">
          <button
            type="button"
            onClick={() => setIsLightboxOpen(true)}
            className={`group relative min-w-0 overflow-hidden rounded-2xl bg-lavender-bg cursor-zoom-in premium-shadow ${
              heroLoaded ? "max-w-full" : "w-full"
            }`}
            aria-label={`View ${productTitle} full screen`}
            aria-busy={!heroLoaded}
          >
            {/* Square skeleton until natural size is known (then snap away). */}
            {!heroLoaded && (
              <div
                className={`aspect-square w-full ${HERO_MAX_H_CLASS} bg-gradient-to-br from-deep-plum/10 via-lavender-bg to-deep-plum/5 animate-pulse`}
                aria-hidden
              >
                <div className="flex h-full w-full items-center justify-center">
                  <span className="material-symbols-outlined text-deep-plum/15 !text-[72px]">
                    cake
                  </span>
                </div>
              </div>
            )}

            {/*
              Adaptive box: max-w-full + max-h cap + intrinsic ratio (w/h auto).
              Largest size that fits the column without crop; tall shots hit the cap.
            */}
            <img
              ref={heroImgRef}
              key={heroUrl!}
              src={heroUrl!}
              alt={currentImage!.alt ?? productTitle}
              className={`block object-contain transition-opacity duration-500 ease-out ${HERO_MAX_H_CLASS} ${
                heroLoaded
                  ? "relative h-auto w-auto max-w-full opacity-100"
                  : "absolute inset-0 h-full w-full opacity-0"
              }`}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              onLoad={(e) => markHeroReady(e.currentTarget)}
              onError={() => setHeroLoaded(true)}
            />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-deep-plum/0 transition-colors duration-300 group-hover:bg-deep-plum/10">
              <span
                className={`material-symbols-outlined text-white !text-[32px] drop-shadow-lg transition-opacity duration-300 ${
                  heroLoaded
                    ? "opacity-0 group-hover:opacity-100"
                    : "opacity-0"
                }`}
              >
                zoom_in
              </span>
            </div>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    prev();
                  }}
                  className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-deep-plum opacity-0 backdrop-blur-sm transition-all duration-300 premium-shadow hover:scale-110 hover:bg-white group-hover:opacity-100"
                  aria-label="Previous image"
                >
                  <span className="material-symbols-outlined !text-[20px]">
                    chevron_left
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    next();
                  }}
                  className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-deep-plum opacity-0 backdrop-blur-sm transition-all duration-300 premium-shadow hover:scale-110 hover:bg-white group-hover:opacity-100"
                  aria-label="Next image"
                >
                  <span className="material-symbols-outlined !text-[20px]">
                    chevron_right
                  </span>
                </button>
              </>
            )}

            {images.length > 1 && (
              <div className="absolute bottom-4 right-4 z-10 rounded-full bg-deep-plum/70 px-3 py-1 text-[11px] font-label-bold tracking-wider text-white backdrop-blur-sm">
                {selectedIndex + 1} / {images.length}
              </div>
            )}
          </button>
        </div>

        {/* ── Thumbnail strip ─────────────────────────────────────────────
            Padding + no overflow on the outer control so focus/selected rings
            are not clipped (ring-offset was getting cut on the first thumb). */}
        {images.length > 1 && (
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-1 py-2">
            {images.map((image, index) => {
              const selected = index === selectedIndex;
              return (
                <button
                  key={image.url}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={`relative h-16 w-16 shrink-0 rounded-xl bg-transparent p-0.5 transition-all duration-200 md:h-20 md:w-20 ${
                    selected
                      ? "ring-2 ring-vibrant-magenta ring-offset-2 ring-offset-page-bg"
                      : "opacity-70 ring-1 ring-outline-variant/50 hover:opacity-100 hover:ring-deep-plum/35"
                  }`}
                  aria-label={`View image ${index + 1}`}
                  aria-current={selected ? "true" : undefined}
                >
                  <span className="block h-full w-full overflow-hidden rounded-[10px] bg-lavender-bg">
                    <img
                      src={image.url}
                      alt={image.alt ?? `${productTitle} view ${index + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Lightbox — viewport-first contain, not the PDP box model ───── */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-[fadeIn_200ms_ease-out]"
          onClick={() => setIsLightboxOpen(false)}
          role="dialog"
          aria-label="Image lightbox"
        >
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-6 right-6 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            aria-label="Close lightbox"
          >
            <span className="material-symbols-outlined !text-[24px]">
              close
            </span>
          </button>

          <div
            className="relative flex max-h-[90vh] max-w-[90vw] items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentImage!.url}
              alt={currentImage!.alt ?? productTitle}
              className="max-h-[90vh] max-w-[90vw] h-auto w-auto object-contain rounded-lg"
              decoding="async"
            />

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  className="absolute left-[-60px] top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                  aria-label="Previous image"
                >
                  <span className="material-symbols-outlined !text-[24px]">
                    chevron_left
                  </span>
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="absolute right-[-60px] top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                  aria-label="Next image"
                >
                  <span className="material-symbols-outlined !text-[24px]">
                    chevron_right
                  </span>
                </button>
              </>
            )}

            {images.length > 1 && (
              <div className="absolute bottom-[-40px] left-1/2 -translate-x-1/2 text-sm font-label-bold tracking-wider text-white/60">
                {selectedIndex + 1} / {images.length}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
