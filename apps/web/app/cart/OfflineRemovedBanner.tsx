"use client"

interface OfflineRemovedBannerProps {
  message: string
  titles: string[]
  onDismiss: () => void
}

export function OfflineRemovedBanner({
  message,
  titles,
  onDismiss,
}: OfflineRemovedBannerProps) {
  return (
    <div
      className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4"
      role="status"
      id="offline-order-removed-banner"
    >
      <span className="material-symbols-outlined text-amber-600 !text-[24px] mt-0.5 shrink-0">
        chat
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-label-bold text-sm text-amber-900">{message}</p>
        {titles.length > 0 && (
          <ul className="mt-2 list-disc list-inside text-xs text-amber-800 space-y-0.5">
            {titles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-amber-400 hover:text-amber-700 transition-colors"
      >
        <span className="material-symbols-outlined !text-[20px]">close</span>
      </button>
    </div>
  )
}
