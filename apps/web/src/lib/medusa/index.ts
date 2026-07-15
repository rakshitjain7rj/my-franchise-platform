/**
 * src/lib/medusa/index.ts
 *
 * Barrel re-export for the Medusa utility layer.
 * Import everything from "@/lib/medusa" instead of individual files.
 */
export { getMedusaHeaders, getMedusaHeadersSync } from "./headers";
export type { MedusaHeaders } from "./headers";

// SDK — only import when @medusajs/js-sdk is installed.
// Consumers that don't need the SDK can just import from "@/lib/medusa/headers".
export { getMedusaSdk, sdk } from "./sdk";
