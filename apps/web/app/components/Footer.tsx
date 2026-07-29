"use client";

import Link from "next/link";
import { Cake, Clock, Mail, MapPin, Phone } from "lucide-react";
import type { ReactNode } from "react";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.73a8.19 8.19 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15z" />
    </svg>
  );
}

function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z" />
    </svg>
  );
}

/** Scraped from eggfreecakebreak.com footer (2026-07-28). */
const OPENING_HOURS = [
  { days: "Monday", hours: "10 AM to 5 PM" },
  { days: "Tuesday to Saturday", hours: "9 AM to 6 PM" },
  { days: "Sunday", hours: "10 AM to 5 PM" },
];

const SOCIAL_LINKS: {
  label: string;
  href: string;
  icon: (props: { className?: string }) => ReactNode;
}[] = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/egglesscakebreak/",
    icon: FacebookIcon,
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/eggfreecakebreak/",
    icon: InstagramIcon,
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@eggfreecakebreak",
    icon: TikTokIcon,
  },
  {
    label: "Pinterest",
    href: "https://www.pinterest.co.uk/eggfreecakebreak/",
    icon: PinterestIcon,
  },
];

const STORE_LOCATIONS = [
  {
    name: "Oldbury",
    address: "352 Londonderry Road, Oldbury, Birmingham, B68 9NB",
    phones: [
      { label: "07305 750164", href: "tel:+447305750164" },
      { label: "0121 544 9280", href: "tel:+441215449280" },
    ],
  },
  {
    name: "Brierley Hill",
    address:
      "Cake Break in Premier at High Street Brierley Hill, 138-142 High Street, DY5 3BP",
    phones: [
      { label: "07552 011662", href: "tel:+447552011662" },
      { label: "0138 448 4926", href: "tel:+441384484926" },
    ],
  },
];

const ORDERS_EMAIL = "orders@eggfreecakebreak.com";

/** Matches "Why Choose Us" column on eggfreecakebreak.com */
const WHY_CHOOSE_LINKS = [
  { label: "Returns / Cancellations", href: "/returns" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Apply Franchise", href: "/franchise" },
  { label: "Contact Us", href: "/contact" },
];

export default function Footer() {
  return (
    <footer className="bg-[#F6F5F7] border-t border-outline-variant/30 pb-16 md:pb-0">
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Opening Hours + socials */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Cake className="h-7 w-7 text-[#5A1B5F] shrink-0" />
              <h2 className="text-2xl font-bold text-[#5A1B5F] font-[var(--font-plus-jakarta)]">
                Cake Break
              </h2>
            </div>
            <h3 className="text-base font-bold text-[#5A1B5F] font-[var(--font-plus-jakarta)]">
              Opening Hours
            </h3>
            <ul className="space-y-3">
              {OPENING_HOURS.map((row) => (
                <li
                  key={row.days}
                  className="flex items-start gap-2 text-sm text-[#81678C]"
                >
                  <Clock className="h-4 w-4 mt-0.5 shrink-0 text-[#5A1B5F]" />
                  <span>
                    <span className="font-medium text-[#5A1B5F]">{row.days}</span>
                    {" - "}
                    {row.hours}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3 pt-1">
              {SOCIAL_LINKS.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-outline-variant/40 text-[#5A1B5F] hover:bg-[#5A1B5F] hover:text-white transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-[#5A1B5F] font-[var(--font-plus-jakarta)]">
              Contact Information
            </h3>
            <ul className="space-y-4 text-sm text-[#81678C]">
              {STORE_LOCATIONS.map((store) => (
                <li key={store.name} className="space-y-1.5">
                  <p className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-[#5A1B5F]" />
                    <span>{store.address}</span>
                  </p>
                  <p className="flex items-start gap-2 pl-6">
                    <Phone className="h-4 w-4 mt-0.5 shrink-0 text-[#5A1B5F]" />
                    <span className="flex flex-wrap gap-x-1">
                      {store.phones.map((p, i) => (
                        <span key={p.href}>
                          {i > 0 && <span className="mx-1">|</span>}
                          <a
                            href={p.href}
                            className="hover:text-[#5A1B5F] transition-colors"
                          >
                            {p.label}
                          </a>
                        </span>
                      ))}
                    </span>
                  </p>
                </li>
              ))}
              <li className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5 shrink-0 text-[#5A1B5F]" />
                <a
                  href={`mailto:${ORDERS_EMAIL}`}
                  className="hover:text-[#5A1B5F] transition-colors break-all"
                >
                  {ORDERS_EMAIL}
                </a>
              </li>
            </ul>
          </div>

          {/* Why Choose Us */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-[#5A1B5F] font-[var(--font-plus-jakarta)]">
              Why Choose Us
            </h3>
            <ul className="space-y-2.5 text-sm">
              {WHY_CHOOSE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[#81678C] hover:text-[#5A1B5F] transition-colors font-medium"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-[#5A1B5F] font-[var(--font-plus-jakarta)]">
              Subscribe to our Newsletter
            </h3>
            <p className="text-sm text-[#81678C] leading-relaxed">
              Get <span className="font-semibold text-[#5A1B5F]">10% Off</span>{" "}
              on first purchase!
            </p>
            <form
              className="flex flex-col sm:flex-row gap-2"
              onSubmit={(e) => e.preventDefault()}
            >
              <label htmlFor="footer-newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="footer-newsletter-email"
                type="email"
                name="email"
                placeholder="Enter your email"
                autoComplete="email"
                className="w-full h-10 px-4 rounded-full border border-outline-variant/40 bg-white text-sm text-[#5A1B5F] placeholder:text-[#81678C]/80 focus:outline-none focus:ring-2 focus:ring-[#5A1B5F]/30"
              />
              <button
                type="submit"
                className="h-10 px-5 rounded-full bg-[#5A1B5F] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#7A2B7F] transition-colors shrink-0"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>

        <div className="my-8 border-t border-gray-300" />

        <p className="text-sm text-[#81678C]">
          Copyright© {new Date().getFullYear()} CAKE BREAK Ltd. All Rights
          Reserved.
        </p>
      </div>
    </footer>
  );
}
