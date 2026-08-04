/**
 * Shared shop shell for catalogue + product detail.
 *
 * Keeps Header/Footer stable across soft navigations between
 * /cake-catalogue and /products/[handle] so chrome does not wait on
 * Medusa product fetches. URLs are unchanged (route group).
 */

import type { ReactNode } from "react";

import Header from "../components/Header";
import Footer from "../components/Footer";

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-page-bg">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
