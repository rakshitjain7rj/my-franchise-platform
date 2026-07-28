"use client";

import Link from "next/link";
import { Cake, Clock, Mail, MapPin, Phone } from "lucide-react";

/** Scraped from eggfreecakebreak.com footer (2026-07-28). */
const OPENING_HOURS = [
  { days: "Monday", hours: "10 AM to 5 PM" },
  { days: "Tuesday to Saturday", hours: "9 AM to 6 PM" },
  { days: "Sunday", hours: "10 AM to 5 PM" },
];

const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/egglesscakebreak/",
    mark: "f",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/eggfreecakebreak/",
    mark: "ig",
  },
  {
    label: "Twitter / X",
    href: "https://twitter.com/cakebreakuk",
    mark: "𝕏",
  },
  {
    label: "Pinterest",
    href: "https://www.pinterest.co.uk/eggfreecakebreak/",
    mark: "p",
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
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white border border-outline-variant/40 text-[#5A1B5F] text-xs font-bold hover:bg-[#5A1B5F] hover:text-white transition-colors"
                >
                  {social.mark}
                </a>
              ))}
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
