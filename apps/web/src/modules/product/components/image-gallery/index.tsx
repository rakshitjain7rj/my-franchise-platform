"use client";

import { useState, useCallback } from "react";

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImageGallery({
  images,
  productTitle,
}: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const hasImages = images.length > 0;
  const currentImage = hasImages ? images[selectedIndex] : null;

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
        <button
          type="button"
          onClick={() => setIsLightboxOpen(true)}
          className="group relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-lavender-bg cursor-zoom-in premium-shadow"
          aria-label={`View ${productTitle} full screen`}
        >
          <img
            src={currentImage!.url}
            alt={currentImage!.alt ?? productTitle}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />

          {/* Hover zoom icon */}
          <div className="absolute inset-0 bg-deep-plum/0 group-hover:bg-deep-plum/10 transition-colors duration-300 flex items-center justify-center">
            <span className="material-symbols-outlined text-white !text-[32px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-lg">
              zoom_in
            </span>
          </div>

          {/* Navigation arrows (visible when more than 1 image) */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-deep-plum opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white hover:scale-110 premium-shadow"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-deep-plum opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white hover:scale-110 premium-shadow"
                aria-label="Next image"
              >
                <span className="material-symbols-outlined !text-[20px]">
                  chevron_right
                </span>
              </button>
            </>
          )}

          {/* Image counter badge */}
          {images.length > 1 && (
            <div className="absolute bottom-4 right-4 bg-deep-plum/70 backdrop-blur-sm text-white text-[11px] font-label-bold px-3 py-1 rounded-full tracking-wider">
              {selectedIndex + 1} / {images.length}
            </div>
          )}
        </button>

        {/* ── Thumbnail strip ───────────────────────────────────────────── */}
        {images.length > 1 && (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {images.map((image, index) => (
              <button
                key={image.url}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`relative flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden transition-all duration-300 ${
                  index === selectedIndex
                    ? "ring-2 ring-vibrant-magenta ring-offset-2 ring-offset-[#E2D4F0] scale-105"
                    : "opacity-60 hover:opacity-100 hover:ring-1 hover:ring-deep-plum/30"
                }`}
                aria-label={`View image ${index + 1}`}
              >
                <img
                  src={image.url}
                  alt={image.alt ?? `${productTitle} view ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Lightbox ────────────────────────────────────────────────────── */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center animate-[fadeIn_200ms_ease-out]"
          onClick={() => setIsLightboxOpen(false)}
          role="dialog"
          aria-label="Image lightbox"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
            aria-label="Close lightbox"
          >
            <span className="material-symbols-outlined !text-[24px]">
              close
            </span>
          </button>

          {/* Lightbox image */}
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentImage!.url}
              alt={currentImage!.alt ?? productTitle}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />

            {/* Lightbox arrows */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  className="absolute left-[-60px] top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                  aria-label="Previous image"
                >
                  <span className="material-symbols-outlined !text-[24px]">
                    chevron_left
                  </span>
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="absolute right-[-60px] top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                  aria-label="Next image"
                >
                  <span className="material-symbols-outlined !text-[24px]">
                    chevron_right
                  </span>
                </button>
              </>
            )}

            {/* Lightbox counter */}
            {images.length > 1 && (
              <div className="absolute bottom-[-40px] left-1/2 -translate-x-1/2 text-white/60 text-sm font-label-bold tracking-wider">
                {selectedIndex + 1} / {images.length}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
