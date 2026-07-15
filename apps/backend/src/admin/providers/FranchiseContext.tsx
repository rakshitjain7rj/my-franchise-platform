/**
 * FranchiseContext.tsx
 *
 * Manages the active franchise selection for multi-tenant admin UI.
 *
 * Design decisions:
 * - `allowed_franchise_ids` is seeded from the /admin/franchise-dashboard API
 *   response, which already enforces RBAC server-side.  The context is a
 *   purely UI-level convenience; all actual data scoping is enforced by the
 *   backend `x-franchise-id` middleware.
 * - We persist the chosen ID to localStorage so the selection survives a page
 *   refresh.  On mount we cross-check the persisted value against the current
 *   `allowed_franchise_ids`; if it is no longer valid we fall back to the
 *   first allowed ID.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FranchiseContextValue {
  /** The currently active franchise ID sent with every API request. */
  activeFranchiseId: string | null
  /** All franchise IDs the authenticated user is allowed to access. */
  allowedFranchiseIds: string[]
  /**
   * Switch the active franchise.  Throws if `id` is not in
   * `allowedFranchiseIds`.
   */
  setActiveFranchiseId: (id: string) => void
  /** Replace the full list – typically called once after the initial API fetch. */
  setAllowedFranchiseIds: (ids: string[]) => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const STORAGE_KEY = "medusa_active_franchise_id"

const FranchiseContext = createContext<FranchiseContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface FranchiseProviderProps {
  children: React.ReactNode
  /**
   * Seed value for the allowed list (e.g. from an SSR fetch or a parent
   * component that already has the data).  The provider also accepts
   * `setAllowedFranchiseIds` calls after mount.
   */
  initialAllowedFranchiseIds?: string[]
}

export const FranchiseProvider: React.FC<FranchiseProviderProps> = ({
  children,
  initialAllowedFranchiseIds = [],
}) => {
  const [allowedFranchiseIds, setAllowedFranchiseIdsState] = useState<string[]>(
    initialAllowedFranchiseIds
  )

  /**
   * Derive the initial active ID:
   *   - Always starts as null (or first allowed ID) to ensure SSR and first client render match.
   *   - A useEffect below restores the persisted localStorage value on the client after mount.
   */
  const [activeFranchiseId, setActiveFranchiseIdState] = useState<string | null>(
    // Do NOT read localStorage here — it causes hydration mismatch.
    // The server has no localStorage, so initial state must be deterministic.
    initialAllowedFranchiseIds.length > 0 ? initialAllowedFranchiseIds[0] : null
  )

  // Restore from localStorage on mount (client-only, runs after hydration).
  useEffect(() => {
    if (initialAllowedFranchiseIds.length === 0) return
    try {
      const persisted = localStorage.getItem(STORAGE_KEY)
      if (persisted && initialAllowedFranchiseIds.includes(persisted)) {
        setActiveFranchiseIdState(persisted)
      }
    } catch {
      // localStorage may be unavailable in some environments.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount only

  /**
   * When the allowed list changes (e.g. after the API response arrives),
   * re-evaluate whether the current active ID is still valid.
   */
  useEffect(() => {
    if (allowedFranchiseIds.length === 0) return

    setActiveFranchiseIdState((prev) => {
      if (prev && allowedFranchiseIds.includes(prev)) return prev

      // Try to restore from localStorage before defaulting.
      try {
        const persisted = localStorage.getItem(STORAGE_KEY)
        if (persisted && allowedFranchiseIds.includes(persisted)) return persisted
      } catch {
        // ignore
      }

      return allowedFranchiseIds[0]
    })
  }, [allowedFranchiseIds])

  // Persist to localStorage whenever the active ID changes.
  useEffect(() => {
    if (!activeFranchiseId) return
    try {
      localStorage.setItem(STORAGE_KEY, activeFranchiseId)
    } catch {
      // ignore
    }
  }, [activeFranchiseId])

  const setActiveFranchiseId = useCallback(
    (id: string) => {
      if (!allowedFranchiseIds.includes(id)) {
        throw new Error(
          `Franchise ID "${id}" is not in the list of allowed franchises.`
        )
      }
      setActiveFranchiseIdState(id)
    },
    [allowedFranchiseIds]
  )

  const setAllowedFranchiseIds = useCallback((ids: string[]) => {
    setAllowedFranchiseIdsState(ids)
  }, [])

  const value = useMemo<FranchiseContextValue>(
    () => ({
      activeFranchiseId,
      allowedFranchiseIds,
      setActiveFranchiseId,
      setAllowedFranchiseIds,
    }),
    [activeFranchiseId, allowedFranchiseIds, setActiveFranchiseId, setAllowedFranchiseIds]
  )

  return (
    <FranchiseContext.Provider value={value}>
      {children}
    </FranchiseContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the franchise context.  Must be used inside a `<FranchiseProvider>`.
 */
export const useFranchise = (): FranchiseContextValue => {
  const ctx = useContext(FranchiseContext)
  if (!ctx) {
    throw new Error("useFranchise must be used inside <FranchiseProvider>.")
  }
  return ctx
}

export default FranchiseContext
