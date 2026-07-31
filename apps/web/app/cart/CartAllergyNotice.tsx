"use client"

import { whatsAppOrderHref } from "@/lib/data/logistics"

const ALLERGY_WHATSAPP_TEXT =
  "Hi Cake Break — I have an allergy question before ordering. Could you help?"

/**
 * Shop-wide allergy callout on the basket page (client request: red-box style
 * final reminder, including nuts used in the bakery).
 */
export function CartAllergyNotice() {
  const href = whatsAppOrderHref(ALLERGY_WHATSAPP_TEXT)

  return (
    <aside
      className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-4 sm:px-5 sm:py-4 shadow-sm"
      role="note"
      aria-label="Allergy notice"
    >
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-red-600 !text-[28px] shrink-0 mt-0.5">
          warning
        </span>
        <div className="min-w-0 space-y-2">
          <h2 className="font-headline text-base sm:text-lg font-extrabold text-red-900 tracking-tight">
            Allergy notice
          </h2>
          <p className="text-sm leading-relaxed text-red-950/90">
            Our bakery handles{" "}
            <strong className="font-bold">
              nuts including almonds, pistachios, and cashews
            </strong>
            , as well as gluten, dairy, and other allergens. Cakes may contain
            traces even when not listed as ingredients. If you have a severe
            allergy, please{" "}
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline decoration-2 underline-offset-2 text-[#128C7E] hover:text-[#075E54]"
            >
              message us on WhatsApp
            </a>{" "}
            before ordering.
          </p>
        </div>
      </div>
    </aside>
  )
}
