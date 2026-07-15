"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User, Package, MapPin, LogOut, ChevronRight,
  Edit3, Plus, Trash2, Check, X, AlertCircle,
  ShoppingBag, Home, Phone, Mail, Calendar, CreditCard, Heart
} from "lucide-react";
import { logoutCustomer } from "@/lib/auth/auth-actions";
import { useCart } from "@/lib/cart/cart-context";
import { getWishlist, removeFromWishlist, type WishlistItem } from "@/lib/wishlist";
import {
  updateCustomerProfile,
  addCustomerAddress,
  deleteCustomerAddress,
  type Address,
  type Order,
} from "@/lib/auth/account-actions";
import type { CustomerProfile } from "@/lib/auth/auth-actions";

type Tab = "overview" | "profile" | "addresses" | "orders" | "wishlist";

interface Props {
  customer: CustomerProfile;
  addresses: Address[];
  orders: Order[];
  initialTab?: string;
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    cancelled: "bg-red-100 text-red-700",
    processing: "bg-blue-100 text-blue-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

// ─── Sidebar Nav ────────────────────────────────────────────────────────────

function Sidebar({
  active, setTab, customer, onLogout, isPending,
}: {
  active: Tab;
  setTab: (t: Tab) => void;
  customer: CustomerProfile;
  onLogout: () => void;
  isPending: boolean;
}) {
  const nav: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview",  label: "Overview",     icon: <Home className="h-4 w-4" /> },
    { id: "profile",   label: "My Profile",   icon: <User className="h-4 w-4" /> },
    { id: "addresses", label: "Address Book", icon: <MapPin className="h-4 w-4" /> },
    { id: "orders",    label: "My Orders",    icon: <Package className="h-4 w-4" /> },
    { id: "wishlist",  label: "My Wishlist",  icon: <Heart className="h-4 w-4" /> },
  ];

  return (
    <aside className="w-full md:w-64 shrink-0">
      {/* Avatar card */}
      <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-5 mb-4 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-deep-plum flex items-center justify-center text-white text-2xl font-bold mb-3 shadow-lg">
          {(customer.first_name?.[0] ?? customer.email[0]).toUpperCase()}
        </div>
        <p className="font-bold text-deep-plum text-sm leading-tight">
          {customer.first_name} {customer.last_name}
        </p>
        <p className="text-xs text-on-surface-variant mt-0.5 truncate">{customer.email}</p>
      </div>

      {/* Nav */}
      <nav className="bg-white rounded-2xl shadow-sm border border-purple-100 overflow-hidden mb-4">
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all text-left border-b border-purple-50 last:border-0 ${
              active === item.id
                ? "bg-deep-plum text-white"
                : "text-on-surface hover:bg-lavender-bg"
            }`}
          >
            {item.icon}
            {item.label}
            {active === item.id && <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
          </button>
        ))}
      </nav>

      <button
        onClick={onLogout}
        disabled={isPending}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 bg-white border border-red-100 rounded-2xl transition-all"
      >
        <LogOut className="h-4 w-4" />
        {isPending ? "Signing out…" : "Sign Out"}
      </button>
    </aside>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({
  customer, addresses, orders, setTab,
}: {
  customer: CustomerProfile;
  addresses: Address[];
  orders: Order[];
  setTab: (t: Tab) => void;
}) {
  const recent = orders.slice(0, 3);
  const defaultShipping = addresses.find((a) => a.is_default_shipping);

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "Total Orders", value: orders.length, icon: <ShoppingBag className="h-5 w-5 text-secondary" /> },
          { label: "Saved Addresses", value: addresses.length, icon: <MapPin className="h-5 w-5 text-secondary" /> },
          {
            label: "Lifetime Spend",
            value: formatPrice(
              orders.reduce((s, o) => s + (o.total ?? 0), 0),
              orders[0]?.currency_code ?? "gbp"
            ),
            icon: <CreditCard className="h-5 w-5 text-secondary" />,
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-purple-100 shadow-sm p-4 flex items-center gap-3">
            <div className="p-2 bg-lavender-bg rounded-xl shrink-0">{stat.icon}</div>
            <div>
              <p className="text-xl font-bold text-deep-plum">{stat.value}</p>
              <p className="text-xs text-on-surface-variant">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Contact info */}
      <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-deep-plum">Contact Information</h2>
          <button onClick={() => setTab("profile")} className="text-xs text-secondary font-semibold hover:underline flex items-center gap-1">
            <Edit3 className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <User className="h-4 w-4 shrink-0" />
            <span>{customer.first_name} {customer.last_name}</span>
          </div>
          <div className="flex items-center gap-2 text-on-surface-variant">
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">{customer.email}</span>
          </div>
          {customer.phone && (
            <div className="flex items-center gap-2 text-on-surface-variant">
              <Phone className="h-4 w-4 shrink-0" />
              <span>{customer.phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Default shipping address */}
      <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-deep-plum">Default Shipping Address</h2>
          <button onClick={() => setTab("addresses")} className="text-xs text-secondary font-semibold hover:underline flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> Manage
          </button>
        </div>
        {defaultShipping ? (
          <p className="text-sm text-on-surface-variant leading-relaxed">
            {defaultShipping.address_1}{defaultShipping.address_2 ? `, ${defaultShipping.address_2}` : ""}<br />
            {defaultShipping.city}, {defaultShipping.postal_code?.toUpperCase()}<br />
            {defaultShipping.country_code?.toUpperCase()}
          </p>
        ) : (
          <p className="text-sm text-on-surface-variant italic">No default shipping address set.</p>
        )}
      </div>

      {/* Recent orders */}
      <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-deep-plum">Recent Orders</h2>
          {orders.length > 0 && (
            <button onClick={() => setTab("orders")} className="text-xs text-secondary font-semibold hover:underline">View All</button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-on-surface-variant italic">You haven&apos;t placed any orders yet.</p>
        ) : (
          <div className="space-y-3">
            {recent.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-3 bg-lavender-bg rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-deep-plum">Order #{o.display_id}</p>
                  <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3" /> {formatDate(o.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColor(o.status)}`}>
                    {o.status}
                  </span>
                  <p className="text-sm font-bold text-deep-plum mt-1">{formatPrice(o.total, o.currency_code)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab({ customer }: { customer: CustomerProfile }) {
  const [isPending, start] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await updateCustomerProfile(fd);
      if (res.success) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(res.error ?? "Update failed.");
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-6 max-w-xl">
      <h2 className="font-bold text-deep-plum text-lg mb-1">Personal Information</h2>
      <p className="text-xs text-on-surface-variant mb-6">Update your name and phone number.</p>

      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-sm text-emerald-700">
          <Check className="h-4 w-4 shrink-0" /> Profile updated successfully!
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="First Name" name="first_name" defaultValue={customer.first_name ?? ""} required />
          <Field label="Last Name" name="last_name" defaultValue={customer.last_name ?? ""} required />
        </div>
        <Field label="Email Address" name="email" defaultValue={customer.email} type="email" disabled hint="Email cannot be changed here." />
        <Field label="Phone Number" name="phone" defaultValue={customer.phone ?? ""} type="tel" />

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 w-full h-11 bg-deep-plum text-white rounded-xl font-bold text-sm hover:bg-deep-plum/90 transition-all disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save Changes"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label, name, defaultValue = "", type = "text", required, disabled, hint,
}: {
  label: string; name: string; defaultValue?: string;
  type?: string; required?: boolean; disabled?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-deep-plum uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-secondary ml-0.5">*</span>}
      </label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        className="w-full h-10 px-3 border border-outline-variant rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary disabled:bg-lavender-bg disabled:text-on-surface-variant transition"
      />
      {hint && <p className="text-[11px] text-on-surface-variant mt-1">{hint}</p>}
    </div>
  );
}

// ─── Addresses Tab ────────────────────────────────────────────────────────────

function AddressCard({
  address, onDelete,
}: {
  address: Address;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const recipient = [address.first_name, address.last_name].filter(Boolean).join(" ");

  return (
    <div className="bg-white border border-purple-100 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-bold text-deep-plum">
            {address.address_name || recipient || "Saved address"}
          </p>
          {recipient && address.address_name && (
            <p className="text-xs text-on-surface-variant mt-0.5">
              Deliver to: <span className="font-medium text-on-surface">{recipient}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-1">
            {address.is_default_shipping && (
              <span className="text-[10px] bg-secondary/10 text-secondary font-semibold px-2 py-0.5 rounded-full">Default Shipping</span>
            )}
            {address.is_default_billing && (
              <span className="text-[10px] bg-deep-plum/10 text-deep-plum font-semibold px-2 py-0.5 rounded-full">Default Billing</span>
            )}
          </div>
        </div>
        <div className="flex gap-1.5">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
              title="Delete address"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-600 font-medium">Delete?</span>
              <button onClick={() => onDelete(address.id)} className="p-1 text-red-600 hover:bg-red-100 rounded">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setConfirming(false)} className="p-1 text-gray-500 hover:bg-gray-100 rounded">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
      {!address.address_name && recipient && (
        <p className="text-xs font-medium text-on-surface mb-1">{recipient}</p>
      )}
      <p className="text-sm text-on-surface-variant leading-relaxed">
        {address.address_1}{address.address_2 ? `, ${address.address_2}` : ""}<br />
        {address.city}, {address.postal_code?.toUpperCase()}<br />
        {address.country_code?.toUpperCase()}
      </p>
      {address.phone && (
        <p className="text-xs text-on-surface-variant mt-1 flex items-center gap-1">
          <Phone className="h-3 w-3" /> {address.phone}
        </p>
      )}
    </div>
  );
}

function AddAddressForm({
  onClose,
  customer,
  isFirstAddress,
}: {
  onClose: () => void;
  customer: CustomerProfile;
  isFirstAddress: boolean;
}) {
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await addCustomerAddress(fd);
      if (res.success) {
        router.refresh();
        onClose();
      } else {
        setError(res.error ?? "Failed to add address.");
      }
    });
  };

  return (
    <div className="bg-white border border-purple-100 rounded-2xl p-5 shadow-sm col-span-full">
      <h3 className="font-bold text-deep-plum mb-1">Add New Address</h3>
      <p className="text-xs text-on-surface-variant mb-4">
        Name is pre-filled from your account. Change it if this address is for
        someone else (e.g. a parent or gift recipient).
      </p>
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Label (e.g. Home, Mum's house)" name="address_name" />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="First Name"
            name="first_name"
            defaultValue={customer.first_name ?? ""}
            required
            hint="Recipient first name — edit if delivering to someone else"
          />
          <Field
            label="Last Name"
            name="last_name"
            defaultValue={customer.last_name ?? ""}
            required
            hint="Recipient last name — edit if delivering to someone else"
          />
        </div>
        <Field label="Street Address" name="address_1" required />
        <Field label="Address Line 2" name="address_2" />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="City" name="city" required />
          <Field label="Postcode" name="postal_code" required />
        </div>
        <Field
          label="Phone"
          name="phone"
          type="tel"
          defaultValue={customer.phone ?? ""}
          hint="Optional contact number for this delivery address"
        />
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
            <input
              type="checkbox"
              name="is_default_shipping"
              value="true"
              defaultChecked={isFirstAddress}
              className="accent-secondary"
            />
            Set as default shipping
          </label>
          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
            <input
              type="checkbox"
              name="is_default_billing"
              value="true"
              defaultChecked={isFirstAddress}
              className="accent-secondary"
            />
            Set as default billing
          </label>
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 h-10 bg-deep-plum text-white rounded-xl font-bold text-sm hover:bg-deep-plum/90 transition disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save Address"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 border border-outline-variant rounded-xl text-sm font-medium hover:bg-lavender-bg transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function AddressesTab({
  addresses,
  customer,
}: {
  addresses: Address[];
  customer: CustomerProfile;
}) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, start] = useTransition();
  const router = useRouter();

  const handleDelete = (id: string) => {
    start(async () => {
      await deleteCustomerAddress(id);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-bold text-deep-plum text-lg">Address Book</h2>
          <p className="text-xs text-on-surface-variant">
            Saved addresses pre-fill checkout. Add multiple for gifts or family.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-deep-plum px-4 py-2 rounded-xl hover:bg-deep-plum/90 transition"
          >
            <Plus className="h-4 w-4" /> Add Address
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {showForm && (
          <AddAddressForm
            onClose={() => setShowForm(false)}
            customer={customer}
            isFirstAddress={addresses.length === 0}
          />
        )}
        {addresses.length === 0 && !showForm ? (
          <div className="col-span-full text-center py-12 text-on-surface-variant bg-white rounded-2xl border border-purple-100">
            <MapPin className="h-10 w-10 mx-auto mb-3 text-outline-variant" />
            <p className="text-sm font-medium">No addresses saved yet.</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-secondary font-semibold hover:underline">
              Add your first address →
            </button>
          </div>
        ) : (
          addresses.map((a) => (
            <AddressCard key={a.id} address={a} onDelete={handleDelete} />
          ))
        )}
      </div>
      {isPending && <p className="text-xs text-on-surface-variant mt-3 animate-pulse">Updating…</p>}
    </div>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────

function OrdersTab({ orders }: { orders: Order[] }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="font-bold text-deep-plum text-lg">My Orders</h2>
        <p className="text-xs text-on-surface-variant">{orders.length} order{orders.length !== 1 ? "s" : ""} placed.</p>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-purple-100 text-on-surface-variant">
          <ShoppingBag className="h-12 w-12 mx-auto mb-4 text-outline-variant" />
          <p className="font-medium">No orders yet.</p>
          <p className="text-sm mt-1">Start shopping to see your orders here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-white border border-purple-100 rounded-2xl shadow-sm overflow-hidden">
              {/* Order header */}
              <div className="flex flex-wrap items-center justify-between px-5 py-4 border-b border-purple-50 bg-lavender-bg/50">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-xs text-on-surface-variant uppercase tracking-wider">Order</span>
                    <p className="font-bold text-deep-plum">#{order.display_id}</p>
                  </div>
                  <div>
                    <span className="text-xs text-on-surface-variant uppercase tracking-wider">Date</span>
                    <p className="font-semibold text-on-surface">{formatDate(order.created_at)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-on-surface-variant uppercase tracking-wider">Total</span>
                    <p className="font-bold text-deep-plum">{formatPrice(order.total, order.currency_code)}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${statusColor(order.status)}`}>
                  {order.status}
                </span>
              </div>

              {/* Items */}
              {order.items?.length > 0 && (
                <div className="px-5 py-4 divide-y divide-purple-50">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="h-12 w-12 rounded-xl object-cover shrink-0 border border-purple-50"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-xl bg-lavender-bg shrink-0 flex items-center justify-center text-secondary">
                          🎂
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{item.title}</p>
                        <p className="text-xs text-on-surface-variant">Qty: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-bold text-deep-plum shrink-0">
                        {formatPrice(item.unit_price * item.quantity, order.currency_code)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Wishlist Tab ─────────────────────────────────────────────────────────────

function WishlistTab() {
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);

  useEffect(() => {
    setWishlist(getWishlist());
    const handleUpdate = () => {
      setWishlist(getWishlist());
    };
    window.addEventListener("wishlist-updated", handleUpdate);
    return () => window.removeEventListener("wishlist-updated", handleUpdate);
  }, []);

  const handleRemove = (id: string) => {
    removeFromWishlist(id);
  };

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-bold text-deep-plum text-lg">My Wishlist</h2>
        <p className="text-xs text-on-surface-variant">Your favorite cakes saved for later.</p>
      </div>

      {wishlist.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-purple-100 text-on-surface-variant">
          <Heart className="h-12 w-12 mx-auto mb-4 text-outline-variant text-purple-200" />
          <p className="font-medium">Your wishlist is empty.</p>
          <p className="text-sm mt-1">Explore our cakes and save your favorites!</p>
          <Link
            href="/cake-catalogue"
            className="mt-4 inline-flex items-center justify-center h-10 px-5 rounded-xl bg-deep-plum text-white text-xs font-semibold hover:bg-deep-plum/90 transition-all"
          >
            Browse Cakes
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {wishlist.map((item) => (
            <div key={item.id} className="bg-white border border-purple-100 rounded-2xl p-4 shadow-sm flex gap-4 items-center">
              {item.thumbnail ? (
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  className="h-20 w-20 rounded-xl object-cover shrink-0 border border-purple-50"
                />
              ) : (
                <div className="h-20 w-20 rounded-xl bg-lavender-bg shrink-0 flex items-center justify-center text-secondary text-2xl">
                  🎂
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-deep-plum truncate">{item.title}</h3>
                <p className="text-sm font-bold text-secondary mt-1">{item.price}</p>
                <div className="flex gap-2 mt-3">
                  <Link
                    href={`/products/${item.handle}`}
                    className="flex-1 flex items-center justify-center h-8 rounded-lg bg-deep-plum text-white text-xs font-semibold hover:bg-vibrant-magenta transition-all"
                  >
                    View Cake
                  </Link>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 border border-red-100 rounded-lg transition"
                    title="Remove from Wishlist"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function AccountDashboard({ customer, addresses, orders, initialTab }: Props) {
  const [tab, setTab] = useState<Tab>(() => {
    if (initialTab && ["overview", "profile", "addresses", "orders", "wishlist"].includes(initialTab)) {
      return initialTab as Tab;
    }
    return "overview";
  });
  const [isPending, start] = useTransition();
  const router = useRouter();
  const { clearCart } = useCart();

  useEffect(() => {
    if (initialTab && ["overview", "profile", "addresses", "orders", "wishlist"].includes(initialTab)) {
      setTab(initialTab as Tab);
    }
  }, [initialTab]);

  const handleLogout = () => {
    start(async () => {
      await logoutCustomer();
      // Drop the session's cart so the next visitor (or another account) on
      // this browser never inherits the previous customer's items.
      clearCart();
      window.dispatchEvent(new Event("auth-changed"));
      router.refresh();
      router.push("/");
    });
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold font-heading text-deep-plum">My Account</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Welcome back, <span className="font-semibold text-secondary">{customer.first_name ?? "Customer"}</span>
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <Sidebar
          active={tab}
          setTab={setTab}
          customer={customer}
          onLogout={handleLogout}
          isPending={isPending}
        />

        <div className="flex-1 min-w-0">
          {tab === "overview"  && <OverviewTab  customer={customer} addresses={addresses} orders={orders} setTab={setTab} />}
          {tab === "profile"   && <ProfileTab   customer={customer} />}
          {tab === "addresses" && (
            <AddressesTab addresses={addresses} customer={customer} />
          )}
          {tab === "orders"    && <OrdersTab    orders={orders} />}
          {tab === "wishlist"  && <WishlistTab />}
        </div>
      </div>
    </div>
  );
}
