"use server";

/**
 * src/lib/auth/account-actions.ts
 *
 * Next.js Server Actions for customer account self-service:
 *  - Updating profile (name, phone)
 *  - Creating / updating / deleting addresses
 *  - Fetching order history
 */

import { getMedusaHeaders } from "@/lib/medusa/headers";
import { revalidatePath } from "next/cache";

const BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "http://localhost:9000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Address {
  id: string;
  address_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  country_code?: string | null;
  province?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  is_default_shipping?: boolean;
  is_default_billing?: boolean;
}

export interface Order {
  id: string;
  display_id: number;
  status: string;
  created_at: string;
  total: number;
  currency_code: string;
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  title: string;
  quantity: number;
  unit_price: number;
  thumbnail?: string | null;
}

export interface ActionResult {
  success: boolean;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function updateCustomerProfile(
  formData: FormData
): Promise<ActionResult> {
  const first_name = formData.get("first_name")?.toString().trim();
  const last_name = formData.get("last_name")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();

  try {
    const headers = await getMedusaHeaders();
    if (!headers["Authorization"]) {
      return { success: false, error: "You must be logged in." };
    }

    const res = await fetch(`${BACKEND_URL}/store/customers/me`, {
      method: "POST",
      headers,
      body: JSON.stringify({ first_name, last_name, phone }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: body.message ?? "Failed to update profile.",
      };
    }

    revalidatePath("/account");
    return { success: true };
  } catch (err) {
    console.error("[updateCustomerProfile]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export async function getCustomerAddresses(): Promise<Address[]> {
  try {
    const headers = await getMedusaHeaders();
    if (!headers["Authorization"]) return [];

    const res = await fetch(`${BACKEND_URL}/store/customers/me/addresses`, {
      headers,
      next: { revalidate: 0 },
    });

    if (!res.ok) return [];
    const body = await res.json();
    const addresses = body.addresses ?? [];
    return addresses.map((a: any) => ({
      ...a,
      address_name: a.company || a.address_name || null,
    }));
  } catch {
    return [];
  }
}

export async function addCustomerAddress(
  formData: FormData
): Promise<ActionResult> {
  const payload = {
    address_name: formData.get("address_name")?.toString().trim() || undefined,
    company: formData.get("address_name")?.toString().trim() || undefined,
    first_name: formData.get("first_name")?.toString().trim(),
    last_name: formData.get("last_name")?.toString().trim(),
    address_1: formData.get("address_1")?.toString().trim(),
    address_2: formData.get("address_2")?.toString().trim() || undefined,
    city: formData.get("city")?.toString().trim(),
    country_code: formData.get("country_code")?.toString().trim() || "gb",
    postal_code: formData.get("postal_code")?.toString().trim(),
    phone: formData.get("phone")?.toString().trim() || undefined,
    is_default_shipping: formData.get("is_default_shipping") === "true",
    is_default_billing: formData.get("is_default_billing") === "true",
  };

  try {
    const headers = await getMedusaHeaders();
    if (!headers["Authorization"]) {
      return { success: false, error: "You must be logged in." };
    }

    // First saved address becomes the checkout default when the shopper
    // didn't explicitly tick the boxes (keeps cart/checkout pre-fill working).
    if (!payload.is_default_shipping && !payload.is_default_billing) {
      const existing = await getCustomerAddresses();
      if (existing.length === 0) {
        payload.is_default_shipping = true;
        payload.is_default_billing = true;
      }
    }

    const res = await fetch(`${BACKEND_URL}/store/customers/me/addresses`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: body.message ?? "Failed to add address.",
      };
    }

    revalidatePath("/account");
    return { success: true };
  } catch (err) {
    console.error("[addCustomerAddress]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function updateCustomerAddress(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const payload = {
    address_name: formData.get("address_name")?.toString().trim() || undefined,
    company: formData.get("address_name")?.toString().trim() || undefined,
    first_name: formData.get("first_name")?.toString().trim(),
    last_name: formData.get("last_name")?.toString().trim(),
    address_1: formData.get("address_1")?.toString().trim(),
    address_2: formData.get("address_2")?.toString().trim() || undefined,
    city: formData.get("city")?.toString().trim(),
    country_code: formData.get("country_code")?.toString().trim() || "gb",
    postal_code: formData.get("postal_code")?.toString().trim(),
    phone: formData.get("phone")?.toString().trim() || undefined,
    is_default_shipping: formData.get("is_default_shipping") === "true",
    is_default_billing: formData.get("is_default_billing") === "true",
  };

  try {
    const headers = await getMedusaHeaders();
    if (!headers["Authorization"]) {
      return { success: false, error: "You must be logged in." };
    }

    const res = await fetch(
      `${BACKEND_URL}/store/customers/me/addresses/${id}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: body.message ?? "Failed to update address.",
      };
    }

    revalidatePath("/account");
    return { success: true };
  } catch (err) {
    console.error("[updateCustomerAddress]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function deleteCustomerAddress(
  id: string
): Promise<ActionResult> {
  try {
    const headers = await getMedusaHeaders();
    if (!headers["Authorization"]) {
      return { success: false, error: "You must be logged in." };
    }

    const res = await fetch(
      `${BACKEND_URL}/store/customers/me/addresses/${id}`,
      {
        method: "DELETE",
        headers,
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return { success: false, error: "Failed to delete address." };
    }

    revalidatePath("/account");
    return { success: true };
  } catch (err) {
    console.error("[deleteCustomerAddress]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function getCustomerOrders(
  limit = 10,
  offset = 0
): Promise<{ orders: Order[]; count: number }> {
  try {
    const headers = await getMedusaHeaders();
    if (!headers["Authorization"]) return { orders: [], count: 0 };

    const res = await fetch(
      `${BACKEND_URL}/store/orders?limit=${limit}&offset=${offset}&fields=id,display_id,status,created_at,total,currency_code,items.*`,
      {
        headers,
        next: { revalidate: 0 },
      }
    );

    if (!res.ok) return { orders: [], count: 0 };
    const body = await res.json();
    return {
      orders: body.orders ?? [],
      count: body.count ?? 0,
    };
  } catch {
    return { orders: [], count: 0 };
  }
}
