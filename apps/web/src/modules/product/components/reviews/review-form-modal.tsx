"use client";

import { useState } from "react";
import { InteractiveStars } from "./stars";
import { submitProductReview } from "@/lib/data/reviews";

type ReviewFormModalProps = {
  productId: string;
  productTitle: string;
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
};

export default function ReviewFormModal({
  productId,
  productTitle,
  open,
  onClose,
  onSubmitted,
}: ReviewFormModalProps) {
  const [rating, setRating] = useState(5);
  const [nickname, setNickname] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setRating(5);
    setNickname("");
    setTitle("");
    setContent("");
    setEmail("");
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!nickname.trim()) {
      setError("Please enter a display name.");
      return;
    }
    if (!content.trim() || content.trim().length < 10) {
      setError("Please write at least 10 characters about the cake.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitProductReview(productId, {
        rating,
        nickname: nickname.trim(),
        content: content.trim(),
        title: title.trim() || undefined,
        email: email.trim() || undefined,
      });
      setSuccess(result.message);
      onSubmitted?.();
      setTimeout(() => {
        handleClose();
      }, 2200);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not submit your review."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-deep-plum/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-outline-variant/30">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
          <div>
            <h2
              id="review-modal-title"
              className="font-headline-md text-xl text-deep-plum"
            >
              Write a Review
            </h2>
            <p className="text-sm text-on-surface-variant mt-1 line-clamp-1">
              {productTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="text-on-surface-variant hover:text-deep-plum transition-colors"
          >
            <span className="material-symbols-outlined !text-[22px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Your rating
            </label>
            <div>
              <InteractiveStars
                value={rating}
                onChange={setRating}
                disabled={isSubmitting || Boolean(success)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="review-nickname"
              className="text-xs font-bold uppercase tracking-wider text-on-surface-variant"
            >
              Display name *
            </label>
            <input
              id="review-nickname"
              type="text"
              maxLength={50}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={isSubmitting || Boolean(success)}
              placeholder="e.g. Sarah M."
              className="w-full rounded-xl border border-outline-variant/40 bg-lavender-bg/20 px-3 py-2.5 text-sm text-deep-plum focus:outline-none focus:border-vibrant-magenta"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="review-title"
              className="text-xs font-bold uppercase tracking-wider text-on-surface-variant"
            >
              Summary (optional)
            </label>
            <input
              id="review-title"
              type="text"
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting || Boolean(success)}
              placeholder="e.g. Perfect for our anniversary"
              className="w-full rounded-xl border border-outline-variant/40 bg-lavender-bg/20 px-3 py-2.5 text-sm text-deep-plum focus:outline-none focus:border-vibrant-magenta"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label
                htmlFor="review-content"
                className="text-xs font-bold uppercase tracking-wider text-on-surface-variant"
              >
                Your review *
              </label>
              <span className="text-[10px] tabular-nums text-on-surface-variant">
                {content.length}/2000
              </span>
            </div>
            <textarea
              id="review-content"
              rows={4}
              maxLength={2000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isSubmitting || Boolean(success)}
              placeholder="Tell other cake lovers what you thought…"
              className="w-full rounded-xl border border-outline-variant/40 bg-lavender-bg/20 px-3 py-2.5 text-sm text-deep-plum focus:outline-none focus:border-vibrant-magenta resize-none"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="review-email"
              className="text-xs font-bold uppercase tracking-wider text-on-surface-variant"
            >
              Email (optional, never shown)
            </label>
            <input
              id="review-email"
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting || Boolean(success)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-outline-variant/40 bg-lavender-bg/20 px-3 py-2.5 text-sm text-deep-plum focus:outline-none focus:border-vibrant-magenta"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-emerald-700 font-medium" role="status">
              {success}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 h-12 rounded-md border border-outline-variant/40 text-sm font-label-bold uppercase tracking-widest text-deep-plum hover:bg-lavender-bg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || Boolean(success)}
              className="flex-1 h-12 rounded-md bg-deep-plum text-white text-sm font-label-bold uppercase tracking-widest hover:bg-vibrant-magenta transition-colors disabled:opacity-60"
            >
              {isSubmitting ? "Sending…" : success ? "Submitted" : "Submit review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
