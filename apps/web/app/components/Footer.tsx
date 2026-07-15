"use client";

import Link from "next/link";
import { Cake, Globe, Mail, AtSign } from "lucide-react";

const FOOTER_LINKS = [
  { label: "About Us", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Franchise", href: "/franchise" },
  { label: "Find a store", href: "/map-routing" },
  { label: "Cake catalogue", href: "/cake-catalogue" },
];

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

export default function Footer() {
  return (
    <footer className="bg-[#F6F5F7] border-t border-outline-variant/30">
      <div className="container mx-auto px-6 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
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
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-3 text-base text-[#81678C]">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-[#5A1B5F] transition-colors font-medium"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="my-8 border-t border-gray-300" />

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <p className="text-sm text-[#81678C]">
              © {new Date().getFullYear()} Cake Break Confectionery. All rights
              reserved.
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

          <div className="flex items-center gap-6 text-[#81678C]">
            <Link
              href="/contact"
              className="hover:text-[#5A1B5F]"
              aria-label="Contact"
            >
              <Mail className="h-5 w-5" />
            </Link>
            <a
              href="https://wa.me/4407305750164"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#5A1B5F]"
              aria-label="WhatsApp"
            >
              <AtSign className="h-5 w-5" />
            </a>
            <Link href="/" className="hover:text-[#5A1B5F]" aria-label="Home">
              <Globe className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
