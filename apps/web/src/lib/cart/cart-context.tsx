"use client"

/**
 * src/lib/cart/cart-context.tsx
 *
 * Global React Context that manages cart state across the storefront.
 *
 * Responsibilities:
 *  - Persist `cartId` in localStorage.
 *  - Hydrate the cart from Medusa on mount.
 *  - Cross-franchise guard: if the stored cart belongs to a different
 *    franchise (Sales Channel mismatch), clear it and start fresh.
 *  - Cross-customer guard: if the stored cart is owned by a customer other
 *    than the active session (or the session is anonymous), discard it so
 *    one shopper never sees another shopper's cart.
 *  - Cart restore: sign-out only forgets the cart id locally (`clearCart`);
 *    the cart itself stays in Medusa, owned by the customer. On sign-in (or
 *    on mount with a live session and no local cart) the customer's most
 *    recent unfinished cart is restored via `GET /store/active-cart`.
 *  - Expose `addToCart`, `removeFromCart`, `updateQuantity`, `clearCart`,
 *    and `syncCartWithSession` (call after login/registration).
 *  - Track `isLoading` and `error` for UI feedback.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  addLineItem,
  checkCartInventory,
  createCart,
  getCart,
  removeLineItem,
  updateCartMetadata,
  updateLineItem,
} from "./cart-actions"
import { findActiveCustomerCart, transferCartToCustomer } from "./cart-auth-actions"
import { getCurrentCustomer } from "@/lib/auth/auth-actions"
import type {
  CartLineItemMetadata,
  InventoryCheckResult,
  MedusaCart,
  MedusaCartItem,
} from "./cart-actions"
import { collectionSlotToCartMetadata } from "@/types/cake-metadata"

// Re-export types consumers need
export type { MedusaCart, MedusaCartItem, CartLineItemMetadata, InventoryCheckResult }

const CART_ID_KEY = "medusa_cart_id"

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface CartContextValue {
  cart: MedusaCart | null
  cartId: string | null
  isLoading: boolean
  error: string | null
  totalItems: number

  addToCart: (params: {
    variantId: string
    quantity: number
    storeLocationId?: string
    customAttributes?: Record<string, string>
    inscription?: string
    /**
     * Collection / delivery window chosen on the product page. Written to
     * cart-level metadata so the cart and checkout pages stay in sync
     * (line-item `custom_attributes` alone are not enough).
     */
    collectionSlot?: {
      date: string
      /** Canonical HH:mm start */
      time: string
      label?: string
    }
  }) => Promise<void>

  removeFromCart: (lineItemId: string) => Promise<void>
  updateQuantity: (lineItemId: string, quantity: number) => Promise<void>
  clearCart: () => void
  refreshCart: () => Promise<void>
  checkInventory: (storeLocationId: string) => Promise<InventoryCheckResult | null>
  /**
   * Reconciles the local cart with the active customer session. Call right
   * after a successful login/registration:
   *  - a guest cart with items is adopted by (transferred to) the customer,
   *  - otherwise the customer's most recent unfinished cart is restored
   *    (sign-out only forgets the cart locally — it survives server-side),
   *  - a cart owned by a *different* customer is never shown.
   */
  syncCartWithSession: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CartContext = createContext<CartContextValue | null>(null)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readLocalCartId(): string | null {
  if (typeof localStorage === "undefined") return null
  return localStorage.getItem(CART_ID_KEY)
}

function writeLocalCartId(id: string | null) {
  if (typeof localStorage === "undefined") return
  if (id) localStorage.setItem(CART_ID_KEY, id)
  else localStorage.removeItem(CART_ID_KEY)
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split("=")[1]) : null
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<MedusaCart | null>(null)
  const [cartId, setCartIdState] = useState<string | null>(null)
  // Start true so consumers wait for the mount hydrate pass. Starting false
  // caused a one-frame "ready" race (e.g. PayPal return erroring before local
  // cart id was restored).
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const initialised = useRef(false)

  const setCartId = (id: string | null) => {
    setCartIdState(id)
    writeLocalCartId(id)
  }

  // ── Restore the account's saved cart ─────────────────────────────────────
  // Fetches the logged-in customer's most recent unfinished cart from the
  // backend and makes it the active cart. Returns false when the visitor is
  // anonymous, has no such cart, or the cart belongs to another franchise.
  const restoreAccountCart = useCallback(async (): Promise<boolean> => {
    const saved = await findActiveCustomerCart()
    if (!saved) return false

    // Same cross-franchise guard as hydration: never restore a cart that was
    // built for a different brand's catalogue.
    const activeFranchiseId = readCookie("franchise_id")
    const cartFranchise = saved.metadata?.franchise_id as string | undefined
    if (activeFranchiseId && cartFranchise && cartFranchise !== activeFranchiseId) {
      return false
    }

    const full = await getCart(saved.id)
    if (!full) return false

    setCart(full)
    setCartId(full.id)
    return true
  }, [])

  // ── Hydrate cart on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (initialised.current) return
    initialised.current = true

    const hydrate = async () => {
      const storedId = readLocalCartId()

      if (storedId) {
        const fetched = await getCart(storedId).catch(() => null)

        if (!fetched) {
          // Cart gone from Medusa (expired / deleted)
          setCartId(null)
        } else {
          // ── Cross-franchise guard ──────────────────────────────────────
          // If the stored cart belongs to a different Sales Channel than the
          // currently active franchise, discard it to prevent checkout
          // errors. We rely on cart metadata set at creation time
          // (metadata.franchise_id) rather than resolving sales_channel_id.
          const activeFranchiseId = readCookie("franchise_id")
          const cartFranchise = fetched.metadata?.franchise_id as string | undefined
          const franchiseMismatch = Boolean(
            activeFranchiseId &&
              fetched.sales_channel_id &&
              cartFranchise &&
              cartFranchise !== activeFranchiseId
          )

          // ── Cross-customer guard ───────────────────────────────────────
          // A cart owned by a registered customer must only be shown to that
          // customer. Guest carts (customer_id empty) pass through.
          let customerMismatch = false
          if (!franchiseMismatch && fetched.customer_id) {
            const me = await getCurrentCustomer().catch(() => null)
            customerMismatch = !me || me.id !== fetched.customer_id
          }

          if (!franchiseMismatch && !customerMismatch) {
            setCart(fetched)
            setCartId(fetched.id)
            return
          }

          setCartId(null)
          setCart(null)
        }
      }

      // No usable local cart. If a customer session is still alive (httpOnly
      // cookie), pull their saved cart back — this is what lets a returning
      // shopper (or a second device) pick up where they left off.
      await restoreAccountCart().catch(() => {})
    }

    setIsLoading(true)
    hydrate().finally(() => setIsLoading(false))
  }, [restoreAccountCart])

  // ── Ensure/create cart ───────────────────────────────────────────────────
  const ensureCart = useCallback(async (): Promise<string> => {
    if (cartId) return cartId

    const storeLocationId = readCookie("selected_store_location_id") ?? undefined
    const newCart = await createCart({ storeLocationId })
    setCart(newCart)
    setCartId(newCart.id)

    // If a customer is logged in, immediately claim the fresh cart for them so
    // the resulting order is linked to their account. No-ops for guests (the
    // server action returns null without a session token). Deliberately does
    // NOT update local state from the result: this promise can resolve after
    // a subsequent addLineItem, and its cart snapshot would clobber the newer
    // one. Ownership is refetched on the next hydration anyway.
    transferCartToCustomer(newCart.id).catch(() => {})

    return newCart.id
  }, [cartId])

  // ── syncCartWithSession ──────────────────────────────────────────────────
  const syncCartWithSession = useCallback(async () => {
    const id = cartId ?? readLocalCartId()
    const current = id ? await getCart(id) : null

    if (current) {
      // Guest cart with items → the shopper built it this session, so it
      // wins over any older saved cart. Adopt it into the account.
      if (!current.customer_id && current.items.length > 0) {
        const transferred = await transferCartToCustomer(current.id)
        setCart(transferred ?? current)
        setCartId(current.id)
        return
      }

      // Cart already owned by this customer → keep it.
      if (current.customer_id) {
        const me = await getCurrentCustomer().catch(() => null)
        if (me && me.id === current.customer_id) {
          setCart(current)
          setCartId(current.id)
          return
        }
        // Another customer's cart → fall through and restore this
        // account's own saved cart instead.
      }
    }

    // No usable local cart (none, expired, empty guest, or someone else's):
    // bring back the account's most recent unfinished cart.
    if (await restoreAccountCart()) return

    // Nothing to restore. Keep an empty guest cart if we had one — claiming
    // it for the account so its metadata (store, fulfillment) survives.
    if (current && !current.customer_id) {
      transferCartToCustomer(current.id).catch(() => {})
      setCart(current)
      setCartId(current.id)
      return
    }

    setCart(null)
    setCartId(null)
  }, [cartId, restoreAccountCart])

  // ── addToCart ────────────────────────────────────────────────────────────
  const addToCart = useCallback(
    async (params: {
      variantId: string
      quantity: number
      storeLocationId?: string
      customAttributes?: Record<string, string>
      inscription?: string
      collectionSlot?: {
        date: string
        time: string
        label?: string
      }
    }) => {
      setIsLoading(true)
      setError(null)
      try {
        const id = await ensureCart()
        const storeLocationId =
          params.storeLocationId ??
          readCookie("selected_store_location_id") ??
          undefined
        let updated = await addLineItem(id, {
          variantId: params.variantId,
          quantity: params.quantity,
          storeLocationId,
          customAttributes: params.customAttributes,
          inscription: params.inscription,
        })

        // Promote the product-page slot onto cart metadata so cart / checkout
        // scheduling (and order routing) see the same window without forcing
        // the shopper to re-pick it on the cart page.
        const slot = params.collectionSlot
        if (slot?.date && slot?.time) {
          updated = await updateCartMetadata(id, {
            ...(updated.metadata ?? {}),
            ...(storeLocationId ? { store_location_id: storeLocationId } : {}),
            ...collectionSlotToCartMetadata(slot),
          })
        }

        setCart(updated)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to add item to cart"
        setError(msg)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [ensureCart]
  )

  // ── removeFromCart ───────────────────────────────────────────────────────
  const removeFromCart = useCallback(
    async (lineItemId: string) => {
      if (!cartId) return
      setIsLoading(true)
      setError(null)
      try {
        const updated = await removeLineItem(cartId, lineItemId)
        setCart(updated)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to remove item"
        setError(msg)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [cartId]
  )

  // ── updateQuantity ───────────────────────────────────────────────────────
  const updateQuantity = useCallback(
    async (lineItemId: string, quantity: number) => {
      if (!cartId) return
      if (quantity < 1) {
        await removeFromCart(lineItemId)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const updated = await updateLineItem(cartId, lineItemId, quantity)
        setCart(updated)
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to update quantity"
        setError(msg)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [cartId, removeFromCart]
  )

  // ── clearCart ────────────────────────────────────────────────────────────
  const clearCart = useCallback(() => {
    setCart(null)
    setCartId(null)
  }, [])

  // ── refreshCart ──────────────────────────────────────────────────────────
  const refreshCart = useCallback(async () => {
    if (!cartId) return
    setIsLoading(true)
    try {
      const fetched = await getCart(cartId)
      if (fetched) setCart(fetched)
      else {
        setCart(null)
        setCartId(null)
      }
    } finally {
      setIsLoading(false)
    }
  }, [cartId])

  // ── checkInventory ───────────────────────────────────────────────────────
  const checkInventory = useCallback(
    async (storeLocationId: string) => {
      if (!cartId) return null
      return checkCartInventory(cartId, storeLocationId)
    },
    [cartId]
  )

  // ── Derived values ───────────────────────────────────────────────────────
  const totalItems = useMemo(
    () => cart?.items.reduce((acc, item) => acc + item.quantity, 0) ?? 0,
    [cart]
  )

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      cartId,
      isLoading,
      error,
      totalItems,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      refreshCart,
      checkInventory,
      syncCartWithSession,
    }),
    [
      cart,
      cartId,
      isLoading,
      error,
      totalItems,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      refreshCart,
      checkInventory,
      syncCartWithSession,
    ]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error("useCart() must be called inside <CartProvider>")
  }
  return ctx
}
