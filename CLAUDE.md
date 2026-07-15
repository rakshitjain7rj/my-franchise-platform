# CLAUDE.md — Developer & Agent Instructions

This guide outlines compilation, testing, and architecture overview for My Franchise Platform.

## Build and Dev Commands
*   **Start all services (Dev)**: `npm run dev` (Runs backend and storefront via Turbo)
*   **Start backend dev**: `npm run backend:dev`
*   **Start storefront dev**: `npm run storefront:dev`
*   **Build monorepo**: `npm run build`
*   **Lint codebase**: `npm run lint`

## Database & Seeding
*   **Seed Database**: `npm run backend:seed`
*   **Run migrations**: `cd apps/backend && npx medusa db:migrate`

## Testing Commands
*   **Run all tests**: `npm run test`
*   **Run backend unit tests**: `cd apps/backend && npm run test:unit`
*   **Run backend integration API tests**: `cd apps/backend && npm run test:integration:api`
*   **Run backend module tests**: `cd apps/backend && npm run test:integration:modules`

## Code & Architecture Overview
*   **Decoupled Multi-Tenant Engine**: Powered by **MedusaJS v2** (backend) and **Next.js 14** (storefront).
*   **Two-Tier Isolation**:
    1.  *Brand/Catalog Boundary*: `Franchise` model (linked to `SalesChannel`, `Product`, and `User`).
    2.  *Fulfillment Boundary*: `StoreLocation` model (linked to Medusa `StockLocation` for branch inventory checks).
*   **Ownership Invariants** (do not violate):
    *   **Current scale**: one live franchise (**Cake Break**). "Multiple stores" are `StoreLocation` rows **under** that franchise — the multi-tenancy exercised today is at the store/fulfillment layer, not the franchise layer.
    *   **Franchise → Product is strictly one-to-many**: every product belongs to **exactly one** franchise, forever. Franchises never share products or inventory; each future franchise gets an entirely separate catalog. Keep `src/links/franchise-product.ts` one-to-many (only the franchise side `isList: true`) — **never** make it many-to-many.
    *   The `franchise-product` link table is the **single source of truth** for product ownership. There is **no** `metadata.franchise_ids` fallback (it was tried and removed as YAGNI/semantically wrong); do not reintroduce it.
*   **Design System**: "Modern Confectionery" styling with Bento Box grid layout using Plus Jakarta Sans (Headings) and Be Vietnam Pro (Body).
*   **Project Documentation**: Refer to [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) for full architecture and model schemas.
