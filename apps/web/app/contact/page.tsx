import type { Metadata } from "next";
import Link from "next/link";
import StaticPageShell from "../components/StaticPageShell";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact Us | Cake Break",
  description:
    "Get in touch with Cake Break — enquiry form, email, and WhatsApp support for orders and bakery questions.",
};

const WHATSAPP =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "") ||
  "4407305750164";

export default function ContactPage() {
  return (
    <StaticPageShell
      eyebrow="Support"
      title="Contact Us"
      subtitle="Questions about an order, a custom cake, or your local boutique? We’d love to hear from you."
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-14">
        <aside className="space-y-6">
          <div className="rounded-3xl border border-outline-variant/25 bg-white p-6 space-y-4 shadow-sm">
            <h2 className="font-headline-md text-xl text-deep-plum">
              Reach us directly
            </h2>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <span className="material-symbols-outlined text-vibrant-magenta !text-[22px]">
                  call
                </span>
                <div>
                  <p className="font-semibold text-deep-plum">Phone / WhatsApp</p>
                  <a
                    href={`https://wa.me/${WHATSAPP}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-on-surface-variant hover:text-vibrant-magenta underline-offset-2 hover:underline"
                  >
                    +{WHATSAPP.replace(/^44/, "44 ")}
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="material-symbols-outlined text-vibrant-magenta !text-[22px]">
                  mail
                </span>
                <div>
                  <p className="font-semibold text-deep-plum">Email</p>
                  <a
                    href="mailto:hello@cakebreak.co.uk"
                    className="text-on-surface-variant hover:text-vibrant-magenta underline-offset-2 hover:underline"
                  >
                    hello@cakebreak.co.uk
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="material-symbols-outlined text-vibrant-magenta !text-[22px]">
                  store
                </span>
                <div>
                  <p className="font-semibold text-deep-plum">Local boutiques</p>
                  <Link
                    href="/map-routing"
                    className="text-on-surface-variant hover:text-vibrant-magenta underline-offset-2 hover:underline"
                  >
                    Find your nearest Cake Break →
                  </Link>
                </div>
              </li>
            </ul>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed px-1">
            Order-specific questions are best answered by your selected store —
            include your order number if you have one.
          </p>
        </aside>

        <div className="rounded-3xl border border-outline-variant/25 bg-white p-6 md:p-8 shadow-sm">
          <h2 className="font-headline-md text-xl text-deep-plum mb-6">
            Send an enquiry
          </h2>
          <ContactForm />
        </div>
      </div>
    </StaticPageShell>
  );
}
