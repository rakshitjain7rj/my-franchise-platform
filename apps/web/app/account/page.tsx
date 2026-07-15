/**
 * app/account/page.tsx
 *
 * Protected account dashboard. Redirects to /login if no session exists.
 * Fetches all data server-side for zero layout shift.
 */

import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth/auth-actions";
import { getCustomerAddresses, getCustomerOrders } from "@/lib/auth/account-actions";
import AccountDashboard from "./AccountDashboard";
import Header from "../components/Header";
import Footer from "../components/Footer";

export const metadata = {
  title: "My Account | Cake Break",
  description: "Manage your profile, addresses and orders.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const customer = await getCurrentCustomer();
  const resolvedParams = await searchParams;
  const tab = resolvedParams.tab;

  if (!customer) {
    // Preserve the destination tab so post-login lands on the right panel
    // (e.g. wishlist / orders) instead of a bare /account overview.
    const destination = tab
      ? `/account?tab=${encodeURIComponent(tab)}`
      : "/account";
    redirect(`/login?redirect=${encodeURIComponent(destination)}`);
  }

  const [addresses, { orders }] = await Promise.all([
    getCustomerAddresses(),
    getCustomerOrders(20, 0),
  ]);

  return (
    <div className="flex flex-col min-h-screen bg-lavender-bg">
      <Header />
      <main className="flex-grow pt-28 pb-16 px-4 md:px-6">
        <AccountDashboard
          customer={customer}
          addresses={addresses}
          orders={orders}
          initialTab={tab}
        />
      </main>
      <Footer />
    </div>
  );
}
