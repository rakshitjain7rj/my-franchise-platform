/**
 * @file guard-franchise-resource-mutations.ts
 * @description Reusable middleware that blocks franchise admins from
 * mutating globally-shared resources (regions, tax, shipping, etc.).
 *
 * Super Admins bypass all checks.
 * Franchise Admins: POST/PUT/PATCH/DELETE → 403
 * Franchise Admins: GET → pass-through (read-only access)
 *
 * "Block all" variant also blocks GET, for highly sensitive resources
 * like API Keys and Gift Cards.
 */

import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { isSuperAdminUser } from "../../utils/tenant-context"

const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"]
const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

/**
 * Blocks franchise admins from mutating a globally-shared resource.
 * GET requests pass through for read-only access.
 */
export const blockFranchiseAdminMutations = async (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const isSuper = await isSuperAdminUser(req)
    if (isSuper) return next()

    if (MUTATION_METHODS.includes(req.method)) {
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "Access denied: only global administrators can modify this resource."
      )
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}

/**
 * Blocks franchise admins from ALL access to highly sensitive resources.
 * Used for API Keys, Gift Cards, etc.
 */
export const blockFranchiseAdminAll = async (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  try {
    const isSuper = await isSuperAdminUser(req)
    if (isSuper) return next()

    if (ALL_METHODS.includes(req.method)) {
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "Access denied: only global administrators can access this resource."
      )
    }

    next()
  } catch (err: unknown) {
    next(err)
  }
}
