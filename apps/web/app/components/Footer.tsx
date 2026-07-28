"use client";

import Link from "next/link";
import { Cake, Clock, Mail } from "lucide-react";

const OPENING_HOURS = [
  { days: "Monday", hours: "10 AM to 5 PM" },
  { days: "Tuesday to Saturday", hours: "9 AM to 6 PM" },
  { days: "Sunday", hours: "10 AM to 5 PM" },
];

const SOCIAL_LINKS = [
  { label: "Facebook", href: "https://www.facebook.com/cakebreakuk", mark: "f" },
  { label: "Instagram", href: "https://www.instagram.com/cakebreakuk", mark: "ig" },
  { label: "Twitter", href: "https://twitter.com/cakebreakuk", mark: "𝕏" },
  { label: "Pinterest", href: "https://www.pinterest.com/cakebreakuk", mark: "p" },
];

const CONTACT_ITEMS = [
  {
    label: "Email",
    value: "hello@cakebreak.co.uk",
    href: "mailto:hello@cakebreak.co.uk",
  },
  {
    label: "Phone / WhatsApp",
    value: "+44 7305 750164",
    href: "https://wa.me/4407305750164",
  },
  {
    label: "Find a store",
    value: "Store locator",
    href: "/map-routing",
  },
];

const WHY_CHOOSE_US = [
  "100% egg-free celebration cakes",
  "Baked fresh at your local boutique",
  "Personalised designs for every occasion",
  "Collection & delivery options",
];

const FOOTER_LINKS = [
  { label: "About Us", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Franchise", href: "/franchise" },
  { label: "Cake catalogue", href: "/cake-catalogue" },
];

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

export default function Footer() {
  return (
    <footer className="bg-[#F6F5F7] border-t border-outline-variant/30 pb-16 md:pb-0">
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="space-y-4 max-w-sm">
            <div className="flex items-center gap-2">
              <Cake className="h-8 w-8 text-[#5A1B5F]" />
              <h2 className="text-3xl md:text-4xl font-bold text-[#5A1B5F] font-[var(--font-plus-jakarta)]">
                Cake Break
              </h2>
            </div>
            <p className="text-sm text-[#81678C] leading-relaxed">
              Artisan egg-free celebration cakes, baked fresh at your local
              boutique. Personalised for every occasion.
            </p>
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

          {/* Opening Hours */}
          <div className="space-y-4">
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
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-[#5A1B5F] font-[var(--font-plus-jakarta)]">
              Contact Information
            </h3>
            <ul className="space-y-3 text-sm text-[#81678C]">
              {CONTACT_ITEMS.map((item) => (
                <li key={item.label}>
                  <p className="font-medium text-[#5A1B5F] text-xs uppercase tracking-wider mb-0.5">
                    {item.label}
                  </p>
                  <a
                    href={item.href}
                    target={item.href.startsWith("http") ? "_blank" : undefined}
                    rel={
                      item.href.startsWith("http")
                        ? "noopener noreferrer"
                        : undefined
                    }
                    className="hover:text-[#5A1B5F] transition-colors"
                  >
                    {item.value}
                  </a>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
              {FOOTER_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-[#81678C] hover:text-[#5A1B5F] transition-colors font-medium"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Why Choose Us + Newsletter */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-base font-bold text-[#5A1B5F] font-[var(--font-plus-jakarta)]">
                Why Choose Us
              </h3>
              <ul className="space-y-2 text-sm text-[#81678C]">
                {WHY_CHOOSE_US.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#5A1B5F] shrink-0" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-bold text-[#5A1B5F] font-[var(--font-plus-jakarta)]">
                Subscribe to our Newsletter
              </h3>
              <p className="text-sm text-[#81678C] leading-relaxed">
                Get news and exclusive offers from Cake Break.
              </p>
              <form
                className="flex flex-col sm:flex-row gap-2"
                onSubmit={(e) => e.preventDefault()}
              >
                <label htmlFor="footer-newsletter-email" className="sr-only">
                  Email address
                </label>
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#81678C]" />
                  <input
                    id="footer-newsletter-email"
                    type="email"
                    name="email"
                    placeholder="Your email"
                    autoComplete="email"
                    className="w-full h-10 pl-9 pr-3 rounded-full border border-outline-variant/40 bg-white text-sm text-[#5A1B5F] placeholder:text-[#81678C]/80 focus:outline-none focus:ring-2 focus:ring-[#5A1B5F]/30"
                  />
                </div>
                <button
                  type="submit"
                  className="h-10 px-5 rounded-full bg-[#5A1B5F] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#7A2B7F] transition-colors shrink-0"
                >
                  Subscribe
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="my-8 border-t border-gray-300" />

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <p className="text-sm text-[#81678C]">
              Copyright© {new Date().getFullYear()} CAKE BREAK Ltd. All Rights
              Reserved.
            </p>
            <div className="flex flex-wrap gap-4 text-sm text-[#81678C]">
              {LEGAL_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:text-[#5A1B5F] transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
