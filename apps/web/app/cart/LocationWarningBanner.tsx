"use client"

import { useEffect, useState } from "react"

interface Props {
  message: string
  onDismiss: () => void
}

export default function LocationWarningBanner({ message, onDismiss }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true))
  }, [])

  return (
    <div
      className={`mb-6 relative rounded-2xl border border-amber-300 bg-amber-50 p-5 flex items-start gap-4 transition-all duration-500 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
      role="alert"
      id="location-warning-banner"
    >
      <span className="material-symbols-outlined text-amber-500 !text-[24px] mt-0.5 shrink-0">
        warning
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-label-bold text-sm text-amber-800">Location Changed</p>
        <p className="text-xs text-amber-700 mt-1 leading-relaxed">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss warning"
        className="shrink-0 text-amber-400 hover:text-amber-700 transition-colors"
      >
        <span className="material-symbols-outlined !text-[20px]">close</span>
      </button>
    </div>
  )
}
