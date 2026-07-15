"use server";

/**
 * src/lib/auth/auth-actions.ts
 *
 * Next.js 15 Server Actions for customer email-password authentication.
 *
 * These run strictly on the server, permitting safe access to the `cookies` API
 * to manage session persistence via the `medusa_auth_token` cookie.
 */

import { cookies } from "next/headers";
import { getMedusaHeaders } from "@/lib/medusa/headers";

const BACKEND_URL =
  (process.env.MEDUSA_BACKEND_URL ?? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ?? "http://localhost:9000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomerProfile {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuthResponse {
  success: boolean;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Persist the JWT session token in the HTTP-only auth cookie.
 *
 * `sameSite: "lax"` matches the other storefront cookies (franchise_id, store
 * selection) and still blocks cross-site POST CSRF while allowing the cookie
 * to be sent on top-level navigations after login.
 */
async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("medusa_auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 1 week session
  });
}

/**
 * Confirm a JWT can actually authorize /store/customers/me before we persist
 * it. A token with an empty actor_id (pre-profile-creation) looks like a
 * successful login to the client but leaves the header stuck on "Sign In".
 */
async function verifyCustomerToken(
  token: string,
  headers: Record<string, string>
): Promise<CustomerProfile | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/store/customers/me`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-publishable-api-key": headers["x-publishable-api-key"],
        Authorization: `Bearer ${token}`,
        ...(headers["x-franchise-id"]
          ? { "x-franchise-id": headers["x-franchise-id"] }
          : {}),
      },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const body = await response.json();
    return (body.customer as CustomerProfile | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Exchange email/password for a fresh JWT via /auth/customer/emailpass.
 *
 * Medusa v2 issues registration tokens with an empty `actor_id` — they cannot
 * authorize /store/customers/me. Once the Customer record exists, a fresh
 * login token (which embeds the customer as actor) must replace it.
 */
async function fetchLoginToken(
  email: string,
  password: string,
  headers: Record<string, string>
): Promise<{ token: string | null; error?: string }> {
  const response = await fetch(`${BACKEND_URL}/auth/customer/emailpass`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": headers["x-publishable-api-key"],
      ...(headers["x-franchise-id"] ? { "x-franchise-id": headers["x-franchise-id"] } : {}),
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  const body = await response.json();

  if (!response.ok) {
    return {
      token: null,
      error: body.message ?? "Authentication failed. Please check your credentials.",
    };
  }
  if (!body.token) {
    return { token: null, error: "No token returned from authentication server." };
  }
  return { token: body.token };
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Log in a customer using email & password.
 * Saves the returned JWT token to a secure, HTTP-only cookie.
 * Also dynamically repairs the session by creating a Customer record if missing.
 */
export async function loginCustomer(
  formData: FormData
): Promise<AuthResponse> {
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  try {
    const headers = await getMedusaHeaders();

    const login = await fetchLoginToken(email, password, headers);
    if (!login.token) {
      return { success: false, error: login.error };
    }

    let sessionToken = login.token;

    // Check if the customer profile exists. If not, dynamically create it (self-healing).
    let profile = await verifyCustomerToken(sessionToken, headers);

    if (!profile) {
      console.log(
        `[loginCustomer] Customer profile not found for ${email}. Dynamically creating customer record...`
      );
      try {
        const createRes = await fetch(`${BACKEND_URL}/store/customers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-publishable-api-key": headers["x-publishable-api-key"],
            Authorization: `Bearer ${sessionToken}`,
            ...(headers["x-franchise-id"]
              ? { "x-franchise-id": headers["x-franchise-id"] }
              : {}),
          },
          body: JSON.stringify({
            email,
            first_name: "Guest",
            last_name: "Customer",
          }),
          cache: "no-store",
        });

        if (!createRes.ok) {
          const createErr = await createRes.json().catch(() => ({}));
          console.error(
            "[loginCustomer] Failed to dynamically create customer profile:",
            createErr
          );
          // Profile may already exist but be unlinked — fall through to re-login
          // only if create failed for a non-fatal reason; still re-issue a token.
        } else {
          console.log(
            `[loginCustomer] Successfully created customer profile for ${email}`
          );
        }

        // Registration / pre-repair tokens have an empty actor_id and cannot
        // authorize /store/customers/me. Always re-login after a repair attempt
        // so the stored JWT embeds the customer as actor.
        const relogin = await fetchLoginToken(email, password, headers);
        if (!relogin.token) {
          console.error(
            "[loginCustomer] Re-login after profile repair failed:",
            relogin.error
          );
          return {
            success: false,
            error:
              "Your credentials are valid, but your account profile could not be loaded. Please try again.",
          };
        }
        sessionToken = relogin.token;
        profile = await verifyCustomerToken(sessionToken, headers);
      } catch (checkErr) {
        console.error(
          "[loginCustomer] Error checking/creating customer profile:",
          checkErr
        );
        return {
          success: false,
          error:
            "Your credentials are valid, but your account profile could not be loaded. Please try again.",
        };
      }
    }

    // Never persist a token that cannot load /store/customers/me — that leaves
    // the header stuck on "Sign In" after a seemingly successful login.
    if (!profile) {
      return {
        success: false,
        error:
          "Authentication succeeded, but we could not load your account. Please try again or contact support.",
      };
    }

    await setAuthCookie(sessionToken);

    return { success: true };
  } catch (err: unknown) {
    console.error("[loginCustomer] Error authenticating:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected server error occurred.",
    };
  }
}

/**
 * Register a new customer identity and automatically log them in.
 * Links the newly created AuthIdentity to a new Customer record.
 */
export async function registerCustomer(
  formData: FormData
): Promise<AuthResponse> {
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();
  const firstName = formData.get("first_name")?.toString().trim();
  const lastName = formData.get("last_name")?.toString().trim();

  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  try {
    const headers = await getMedusaHeaders();

    // 1. Register auth identity
    const response = await fetch(`${BACKEND_URL}/auth/customer/emailpass/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": headers["x-publishable-api-key"],
      },
      body: JSON.stringify({
        email,
        password,
        user_metadata: {
          first_name: firstName || "",
          last_name: lastName || "",
        },
      }),
      cache: "no-store",
    });

    const body = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: body.message ?? "Registration failed. Try a different email.",
      };
    }

    if (!body.token) {
      return { success: false, error: "No token returned from registration server." };
    }

    // 2. Create customer profile record and link it to the newly created auth identity
    try {
      const customerResponse = await fetch(`${BACKEND_URL}/store/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": headers["x-publishable-api-key"],
          "Authorization": `Bearer ${body.token}`,
          ...(headers["x-franchise-id"] ? { "x-franchise-id": headers["x-franchise-id"] } : {}),
        },
        body: JSON.stringify({
          email,
          first_name: firstName || "",
          last_name: lastName || "",
        }),
        cache: "no-store",
      });

      if (!customerResponse.ok) {
        const customerError = await customerResponse.json();
        console.error("[registerCustomer] Error creating customer profile:", customerError);
        return {
          success: false,
          error: customerError.message ?? "Failed to create customer profile record.",
        };
      }
    } catch (customerErr) {
      console.error("[registerCustomer] Network error creating customer profile:", customerErr);
      return {
        success: false,
        error: "Failed to connect to the store server during profile creation.",
      };
    }

    // 3. Automatically log in on successful registration.
    //    The registration token has an empty actor_id (no customer existed when
    //    it was issued) and is rejected by /store/customers/me with a 401 —
    //    storing it would leave the user silently logged out. Exchange it for a
    //    real login token now that the customer record exists.
    const login = await fetchLoginToken(email, password, headers);
    if (!login.token) {
      console.error("[registerCustomer] Post-registration login failed:", login.error);
      return {
        success: false,
        error: "Your account was created, but automatic sign-in failed. Please sign in manually.",
      };
    }

    const profile = await verifyCustomerToken(login.token, headers);
    if (!profile) {
      console.error(
        "[registerCustomer] Login token could not authorize /store/customers/me"
      );
      return {
        success: false,
        error:
          "Your account was created, but automatic sign-in failed. Please sign in manually.",
      };
    }

    await setAuthCookie(login.token);

    return { success: true };
  } catch (err: unknown) {
    console.error("[registerCustomer] Error during registration:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected server error occurred.",
    };
  }
}

/**
 * Terminate the customer's session.
 */
export async function logoutCustomer(): Promise<AuthResponse> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("medusa_auth_token");
    return { success: true };
  } catch (err: unknown) {
    console.error("[logoutCustomer] Error clearing session:", err);
    return { success: false, error: "Failed to log out cleanly." };
  }
}

/**
 * Retrieve the profile details of the currently logged-in customer.
 * Uses getMedusaHeaders to automatically inject the Bearer token.
 */
export async function getCurrentCustomer(): Promise<CustomerProfile | null> {
  try {
    const headers = await getMedusaHeaders();
    
    console.log("[getCurrentCustomer] Resolving customer with headers:", {
      ...headers,
      Authorization: headers["Authorization"] ? `${headers["Authorization"].substring(0, 15)}...` : undefined
    });

    // If there's no auth token cookie, we aren't logged in.
    if (!headers["Authorization"]) {
      console.log("[getCurrentCustomer] No Authorization header found.");
      return null;
    }

    const url = `${BACKEND_URL}/store/customers/me`;
    console.log("[getCurrentCustomer] Fetching", url);
    // cache: "no-store" is required — Next's fetch cache keys primarily on URL,
    // so a pre-login 401 (or empty response) must never be reused after auth.
    const response = await fetch(url, {
      headers,
      cache: "no-store",
    });

    console.log("[getCurrentCustomer] Response status:", response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[getCurrentCustomer] Fetch failed:", errorText);
      return null;
    }

    const body = await response.json();
    console.log("[getCurrentCustomer] Resolved customer profile successfully:", body.customer?.email);
    return body.customer ?? null;
  } catch (err) {
    console.error("[getCurrentCustomer] Error resolving customer:", err);
    return null;
  }
}
