"use client";

/**
 * Floating WhatsApp support button (bottom-right).
 * Number from NEXT_PUBLIC_WHATSAPP_NUMBER, default matches client site.
 */

const DEFAULT_E164 = "4407305750164";

function resolveWhatsAppHref(): string {
  const raw =
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "") ||
    DEFAULT_E164;
  const text = encodeURIComponent(
    "Hi Cake Break! I have a question about an order / cake."
  );
  return `https://wa.me/${raw}?text=${text}`;
}

export default function WhatsAppWidget() {
  const href = resolveWhatsAppHref();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-24 sm:bottom-6 right-5 z-[60] group flex items-center gap-0"
    >
      <span className="mr-2 hidden sm:inline-block max-w-0 overflow-hidden whitespace-nowrap rounded-full bg-deep-plum text-white text-xs font-label-bold uppercase tracking-wider px-0 py-2 opacity-0 transition-all duration-300 group-hover:max-w-xs group-hover:px-4 group-hover:opacity-100 shadow-lg">
        Chat on WhatsApp
      </span>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_rgba(37,211,102,0.45)] transition-transform duration-300 group-hover:scale-110 group-active:scale-95">
        {/* Official-style WhatsApp glyph */}
        <svg
          viewBox="0 0 32 32"
          className="h-7 w-7 fill-current"
          aria-hidden
        >
          <path d="M16.01 3C9.39 3 4 8.37 4 14.97c0 2.1.55 4.06 1.52 5.76L4 29l8.48-2.22A12 12 0 0 0 16 27c6.63 0 12-5.37 12-12.03C28 8.37 22.63 3 16.01 3zm0 21.86c-1.86 0-3.59-.5-5.08-1.36l-.36-.21-5.03 1.32 1.34-4.9-.24-.39A9.86 9.86 0 0 1 6.14 15c0-5.42 4.44-9.83 9.87-9.83 5.43 0 9.86 4.41 9.86 9.83 0 5.43-4.43 9.86-9.86 9.86zm5.42-7.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.04-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z" />
        </svg>
      </span>
    </a>
  );
}
