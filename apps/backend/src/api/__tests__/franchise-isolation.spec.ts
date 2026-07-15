import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"

jest.setTimeout(120000)

/**
 * Runtime verification of the multi-tenant franchise isolation middleware.
 *
 * Fixtures:
 *   - Franchise A  (admin A linked)  — owns Product A and Sales Channel A
 *   - Franchise B  (admin B linked)  — owns nothing
 *   - Super Admin  (metadata.is_super_admin = true, no franchise link)
 *   - A global Customer with NO orders in any franchise channel
 *
 * Covers: C1 (product update verb), C2 (product sub-routes), Tier 2-4 block
 * guards, C3 (returns/exchanges create validation), M2 (empty allow-list = no
 * leak), M3 (inventory traversal does not crash), plus wiring smoke tests.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    const H = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })
    const statusOf = (r: any) => r?.response?.status ?? r?.status

    describe("Franchise Multi-Tenant Isolation (runtime)", () => {
      let franchiseAId: string
      let productAId: string
      let salesChannelAId: string
      let customerId: string
      let adminAToken: string
      let adminBToken: string
      let superToken: string

      beforeEach(async () => {
        const container = getContainer()
        const franchiseModule = container.resolve("franchise")
        const userModule = container.resolve(Modules.USER)
        const productModule = container.resolve(Modules.PRODUCT)
        const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
        const customerModule = container.resolve(Modules.CUSTOMER)
        const remoteLink = container.resolve("remoteLink")

        // 1. Two franchises
        const fa = await franchiseModule.createFranchises({ name: "Branch A", code: "BR_A", is_active: true })
        const fb = await franchiseModule.createFranchises({ name: "Branch B", code: "BR_B", is_active: true })
        franchiseAId = fa.id

        // 2. Admins + super admin
        const adminA = await userModule.createUsers({ email: "a@a.com", first_name: "A", last_name: "A" })
        const adminB = await userModule.createUsers({ email: "b@b.com", first_name: "B", last_name: "B" })
        const superAdmin = await userModule.createUsers({
          email: "s@s.com",
          first_name: "S",
          last_name: "S",
          metadata: { is_super_admin: true },
        })

        await remoteLink.create([
          { [Modules.USER]: { user_id: adminA.id }, franchise: { franchise_id: fa.id } },
          { [Modules.USER]: { user_id: adminB.id }, franchise: { franchise_id: fb.id } },
        ])

        // 3. Product owned by franchise A
        const productA = await productModule.createProducts({ title: "Cake A", status: "published" })
        productAId = productA.id
        await remoteLink.create([
          { franchise: { franchise_id: fa.id }, [Modules.PRODUCT]: { product_id: productA.id } },
        ])

        // 4. Sales channel for franchise A (so the returns/exchanges create-guard
        //    path is exercised rather than short-circuiting on "no channels").
        const scA = await salesChannelModule.createSalesChannels({ name: "Channel A" })
        salesChannelAId = scA.id
        await remoteLink.create([
          { franchise: { franchise_id: fa.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: scA.id } },
        ])

        // 5. A global customer that has never ordered in franchise A's channels
        const cust = await customerModule.createCustomers({ email: "ghost@example.com", first_name: "Ghost", last_name: "Customer" })
        customerId = cust.id

        const { projectConfig: { http } } = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        const secret = http.jwtSecret
        adminAToken = jwt.sign({ actor_id: adminA.id, actor_type: "user" }, secret)
        adminBToken = jwt.sign({ actor_id: adminB.id, actor_type: "user" }, secret)
        superToken = jwt.sign({ actor_id: superAdmin.id, actor_type: "user" }, secret)
      })

      describe("C1 — product mutation guard (update verb is POST)", () => {
        it("blocks a cross-tenant product UPDATE (404)", async () => {
          const r = await api.post(`/admin/products/${productAId}`, { title: "Hacked by B" }, H(adminBToken)).catch((e) => e)
          expect(statusOf(r)).toBe(404)
        })

        it("allows the owning franchise admin to UPDATE its product (200)", async () => {
          const res = await api.post(`/admin/products/${productAId}`, { title: "Updated by A" }, H(adminAToken))
          expect(res.status).toBe(200)
          expect(res.data.product.title).toBe("Updated by A")
        })

        it("allows a super admin to update any product (200)", async () => {
          const res = await api.post(`/admin/products/${productAId}`, { title: "Updated by Super" }, H(superToken))
          expect(res.status).toBe(200)
        })

        it("blocks a cross-tenant product DELETE (404)", async () => {
          const r = await api.delete(`/admin/products/${productAId}`, H(adminBToken)).catch((e) => e)
          expect(statusOf(r)).toBe(404)
        })
      })

      describe("C2 — product sub-route guard (/:id/*)", () => {
        it("blocks reading variants of another franchise's product (404)", async () => {
          const r = await api.get(`/admin/products/${productAId}/variants`, H(adminBToken)).catch((e) => e)
          expect(statusOf(r)).toBe(404)
        })

        it("allows reading the owning franchise's product variants (200)", async () => {
          const res = await api.get(`/admin/products/${productAId}/variants`, H(adminAToken))
          expect(res.status).toBe(200)
        })
      })

      describe("Tier 2-4 — block-mutation / block-all guards", () => {
        it("blocks a franchise admin from creating a region (403)", async () => {
          const r = await api.post(`/admin/regions`, { name: "R", currency_code: "usd" }, H(adminAToken)).catch((e) => e)
          expect(statusOf(r)).toBe(403)
        })

        it("does NOT block a super admin from creating a region (not 403)", async () => {
          const r = await api.post(`/admin/regions`, { name: "R2", currency_code: "usd" }, H(superToken)).then((x) => x).catch((e) => e)
          expect(statusOf(r)).not.toBe(403)
        })

        it("blocks a franchise admin from creating a product category (403)", async () => {
          const r = await api.post(`/admin/product-categories`, { name: "Cat" }, H(adminAToken)).catch((e) => e)
          expect(statusOf(r)).toBe(403)
        })

        it("blocks a franchise admin from reading API keys (block-all, 403)", async () => {
          const r = await api.get(`/admin/api-keys`, H(adminAToken)).catch((e) => e)
          expect(statusOf(r)).toBe(403)
        })

        it("blocks a franchise admin from reading publishable API keys (block-all, 403)", async () => {
          const r = await api.get(`/admin/publishable-api-keys`, H(adminAToken)).catch((e) => e)
          expect(statusOf(r)).toBe(403)
        })

        it("allows a super admin to read API keys (200)", async () => {
          const res = await api.get(`/admin/api-keys`, H(superToken))
          expect(res.status).toBe(200)
        })
      })

      describe("M2 — customers empty allow-list returns no leak", () => {
        it("a franchise admin with no orders sees NONE of the global customers", async () => {
          const res = await api.get(`/admin/customers`, H(adminAToken))
          expect(res.status).toBe(200)
          const ids = (res.data.customers ?? []).map((c: any) => c.id)
          expect(ids).not.toContain(customerId)
        })

        it("a super admin sees the global customer", async () => {
          const res = await api.get(`/admin/customers`, H(superToken))
          const ids = (res.data.customers ?? []).map((c: any) => c.id)
          expect(ids).toContain(customerId)
        })
      })

      describe("Empty allow-list returns NO leak across scoped list resources", () => {
        it("franchise A sees only its own product", async () => {
          const res = await api.get(`/admin/products`, H(adminAToken))
          const ids = (res.data.products ?? []).map((p: any) => p.id)
          expect(ids).toContain(productAId)
        })

        it("franchise B (owns nothing) sees NO products", async () => {
          const res = await api.get(`/admin/products`, H(adminBToken))
          const ids = (res.data.products ?? []).map((p: any) => p.id)
          expect(ids).not.toContain(productAId)
          expect(ids.length).toBe(0)
        })

        it("franchise B (owns nothing) sees NO sales channels", async () => {
          const res = await api.get(`/admin/sales-channels`, H(adminBToken))
          const ids = (res.data.sales_channels ?? []).map((s: any) => s.id)
          expect(ids).not.toContain(salesChannelAId)
          expect(ids.length).toBe(0)
        })
      })

      describe("C3 — returns / exchanges create validates the order's ownership", () => {
        it("blocks creating a return against an order outside the franchise (404)", async () => {
          const r = await api.post(`/admin/returns`, { order_id: "order_not_mine" }, H(adminAToken)).catch((e) => e)
          expect(statusOf(r)).toBe(404)
        })

        it("blocks creating an exchange against an order outside the franchise (404)", async () => {
          const r = await api.post(`/admin/exchanges`, { order_id: "order_not_mine" }, H(adminAToken)).catch((e) => e)
          expect(statusOf(r)).toBe(404)
        })
      })

      describe("Wiring / no-crash smoke (M3 + scoped list endpoints)", () => {
        it("M3: inventory-items list resolves variant→inventory traversal without crashing (200)", async () => {
          const res = await api.get(`/admin/inventory-items`, H(adminAToken))
          expect(res.status).toBe(200)
        })

        it("reservations list is scoped without crashing (200)", async () => {
          const res = await api.get(`/admin/reservations`, H(adminAToken))
          expect(res.status).toBe(200)
        })

        it("draft-orders list is scoped without crashing (200)", async () => {
          const res = await api.get(`/admin/draft-orders`, H(adminAToken))
          expect(res.status).toBe(200)
        })
      })
    })
  },
})
