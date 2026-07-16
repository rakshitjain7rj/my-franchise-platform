"use client"

import Link from "next/link"
import Header from "../components/Header"
import Footer from "../components/Footer"

export function CartEmptyState() {
  return (
    <div className="flex flex-col min-h-screen bg-[#EEDFF5] font-body selection:bg-secondary selection:text-on-secondary">
      <Header />
      <main className="flex-grow flex items-center justify-center pt-28 pb-16">
        <div className="text-center space-y-6 max-w-md mx-auto px-6 py-12 bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm">
          <div className="w-24 h-24 mx-auto rounded-full bg-secondary/10 flex items-center justify-center">
            <span className="material-symbols-outlined !text-[48px] text-secondary">
              shopping_basket
            </span>
          </div>
          <h1 className="font-headline font-bold text-3xl text-primary">
            Your cart is empty
          </h1>
          <p className="text-on-surface-variant text-sm max-w-xs mx-auto leading-relaxed">
            Explore our selection of handcrafted artisanal treats and find
            something sweet to order.
          </p>
          <Link
            href="/cake-catalogue"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-deep-plum text-white font-headline font-bold text-sm uppercase tracking-widest hover:bg-secondary transition-all hover:scale-[1.02] shadow-md hover:shadow-lg active:scale-[0.98]"
          >
            <span className="material-symbols-outlined !text-[18px]">
              storefront
            </span>
            Browse Cakes
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  )
}
