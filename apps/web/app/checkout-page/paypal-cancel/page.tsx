import Link from "next/link"
import Header from "../../components/Header"
import Footer from "../../components/Footer"

export default function PayPalCancelPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#EEDFF5]">
      <Header />
      <main className="flex flex-1 items-center justify-center px-6 py-28">
        <section className="w-full max-w-md rounded-lg border border-outline-variant bg-white p-8 text-center shadow-sm">
          <span className="material-symbols-outlined text-[48px] text-[#4A154B]">payment</span>
          <h1 className="mt-4 text-2xl font-bold text-[#4A154B]">Payment cancelled</h1>
          <p className="mt-3 text-sm text-on-surface-variant">No payment was completed. You can return to checkout and try again.</p>
          <Link href="/checkout-page" className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#4A154B] px-4 py-3 text-sm font-bold text-white">Return to checkout</Link>
        </section>
      </main>
      <Footer />
    </div>
  )
}
