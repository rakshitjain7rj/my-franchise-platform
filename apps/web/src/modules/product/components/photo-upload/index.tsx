"use client";

/**
 * PhotoUpload — edible photo cake image picker.
 *
 * Uploads via POST /store/uploads (Medusa File Module) and returns the
 * public URL for storage in line-item custom_attributes.photo_url.
 */

import { useCallback, useRef, useState } from "react";
import { getMedusaHeadersSync } from "@/lib/medusa/headers";

const BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ??
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ??
  "http://localhost:9000";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export type PhotoUploadProps = {
  value?: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
};

export default function PhotoUpload({
  value,
  onChange,
  disabled,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewLocal, setPreviewLocal] = useState<string | null>(null);

  const preview = value || previewLocal;

  const clear = useCallback(() => {
    setPreviewLocal(null);
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onChange]);

  const handleFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setError(null);

      if (!file.type.startsWith("image/")) {
        setError("Please choose a JPEG, PNG, WebP, or GIF image.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("Image must be 5 MB or smaller.");
        return;
      }

      // Local preview while uploading
      const localUrl = URL.createObjectURL(file);
      setPreviewLocal(localUrl);
      setIsUploading(true);

      try {
        const form = new FormData();
        form.append("files", file);

        // Do not set Content-Type — browser sets multipart boundary.
        const headers = getMedusaHeadersSync();
        const { "Content-Type": _drop, ...rest } = headers;

        const res = await fetch(`${BACKEND_URL}/store/uploads`, {
          method: "POST",
          headers: rest,
          body: form,
          cache: "no-store",
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { message?: string }).message ??
              `Upload failed (${res.status})`
          );
        }

        const json = (await res.json()) as {
          files?: Array<{ url?: string }>;
        };
        const url = json.files?.[0]?.url;
        if (!url) throw new Error("Upload succeeded but no URL was returned.");

        onChange(url);
        setPreviewLocal(null);
        URL.revokeObjectURL(localUrl);
      } catch (err) {
        URL.revokeObjectURL(localUrl);
        setPreviewLocal(null);
        onChange(null);
        setError(
          err instanceof Error ? err.message : "Could not upload photo."
        );
      } finally {
        setIsUploading(false);
      }
    },
    [onChange]
  );

  return (
    <div className="flex flex-col gap-2 bg-white p-3.5 rounded-2xl border border-outline-variant/30 transition-all duration-300 focus-within:border-vibrant-magenta focus-within:shadow-sm">
      <div className="flex items-center gap-2 text-vibrant-magenta">
        <svg
          className="w-4 h-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 15l-5-5L5 21"
          />
        </svg>
        <span className="text-xs font-bold text-on-surface-variant/90 uppercase tracking-wider">
          Edible Photo (Optional)
        </span>
      </div>

      <p className="text-xs text-on-surface-variant leading-relaxed">
        Upload a PNG or JPG of the design you want printed on the cake (max
        5&nbsp;MB).
      </p>

      {preview ? (
        <div className="relative w-full max-w-[200px] aspect-square rounded-xl overflow-hidden border border-outline-variant/40 bg-surface-container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Cake photo preview"
            className="w-full h-full object-cover"
          />
          {!disabled && !isUploading && (
            <button
              type="button"
              onClick={clear}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-deep-plum/80 text-white flex items-center justify-center hover:bg-vibrant-magenta transition-colors"
              aria-label="Remove photo"
            >
              <span className="material-symbols-outlined !text-[16px]">
                close
              </span>
            </button>
          )}
          {isUploading && (
            <div className="absolute inset-0 bg-deep-plum/40 flex items-center justify-center">
              <span className="text-white text-xs font-label-bold uppercase tracking-widest">
                Uploading…
              </span>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || isUploading}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-xl border-2 border-dashed border-outline-variant/50 bg-lavender-bg/30 hover:border-vibrant-magenta/50 hover:bg-lavender-bg/60 transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-vibrant-magenta !text-[28px]">
            add_photo_alternate
          </span>
          <span className="text-xs font-label-bold text-deep-plum uppercase tracking-widest">
            {isUploading ? "Uploading…" : "Choose photo"}
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={disabled || isUploading}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {error && (
        <p className="text-xs text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
