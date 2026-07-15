/**
 * Shared chrome for marketing / static pages (about, franchise, contact).
 */

import type { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";

type StaticPageShellProps = {
  children: ReactNode;
  /** Optional narrow hero band above content */
  eyebrow?: string;
  title: string;
  subtitle?: string;
};

export default function StaticPageShell({
  children,
  eyebrow,
  title,
  subtitle,
}: StaticPageShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[#FDFBFE]">
      <Header />
      <main className="flex-1">
        <section className="bg-gradient-to-br from-deep-plum via-purple-900 to-purple-800 text-white">
          <div className="max-w-[960px] mx-auto px-5 md:px-8 py-14 md:py-20 space-y-3">
            {eyebrow && (
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-pink-200">
                {eyebrow}
              </p>
            )}
            <h1 className="font-headline-xl text-3xl md:text-5xl leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-base md:text-lg text-white/80 max-w-2xl leading-relaxed font-body-md">
                {subtitle}
              </p>
            )}
          </div>
        </section>
        <div className="max-w-[960px] mx-auto px-5 md:px-8 py-12 md:py-16">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
