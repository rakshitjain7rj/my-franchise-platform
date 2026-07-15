import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"

jest.setTimeout(120000)

/**
 * Runtime verification of the auth-hardening pass:
 *
 *   1. Unauthenticated requests to scoped admin routes → 401.
 *   2. Order scoping resolves through the canonical `franchise-sales-channel`
 *      link (NOT the retired `franchise-store` chain):
 *        - owning admin sees the order; a foreign admin sees an empty list and
 *          is denied on the detail route,
 *        - a franchise with no linked sales channel gets an empty list / 403,
 *          never a global leak.
 *   3. Tier-2 branch-manager isolation: a manager bound to store S2 cannot see
 *      or open an order placed at store S1 of the SAME franchise.
 *   4. Brute-force rate limiting on /auth/customer/emailpass (5 failures/15min)
 *      and /auth/customer/emailpass/register (3 attempts/hour).
 *
 * Fixtures (recreated per test; DB is truncated between tests):
 *   - Franchise A: admin A, sales channel A, store locations S1 + S2,
 *     manager M2 bound to S2, order O1 @ S1, order O2 @ S2.
 *   - Franchise B: admin B, sales channel B, no orders.
 *   - Franchise C: admin C, NO sales channel linked.
 *   - Super admin (metadata.is_super_admin = true, no franchise link).
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    const H = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })
    const statusOf = (r: any) => r?.response?.status ?? r?.status
    const bodyOf = (r: any) => r?.response?.data ?? r?.data

    describe("Auth hardening (runtime)", () => {
      let salesChannelAId: string
      let orderS1Id: string
      let orderS2Id: string
      let adminAToken: string
      let adminBToken: string
      let adminCToken: string
      let managerS2Token: string
      let superToken: string

      beforeEach(async () => {
        const container = getContainer()
        const franchiseModule = container.resolve("franchise")
        const userModule = container.resolve(Modules.USER)
        const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
        const orderModule = container.resolve(Modules.ORDER)
        const remoteLink = container.resolve("remoteLink")

        // 1. Franchises
        const fa = await franchiseModule.createFranchises({ name: "Branch A", code: "BR_A", is_active: true })
        const fb = await franchiseModule.createFranchises({ name: "Branch B", code: "BR_B", is_active: true })
        const fc = await franchiseModule.createFranchises({ name: "Branch C", code: "BR_C", is_active: true })

        // 2. Users: one admin per franchise, a store-scoped manager in A, a super admin
        const adminA = await userModule.createUsers({ email: "a@a.com", first_name: "A", last_name: "A" })
        const adminB = await userModule.createUsers({ email: "b@b.com", first_name: "B", last_name: "B" })
        const adminC = await userModule.createUsers({ email: "c@c.com", first_name: "C", last_name: "C" })
        const managerS2 = await userModule.createUsers({ email: "m2@a.com", first_name: "M", last_name: "Two" })
        const superAdmin = await userModule.createUsers({
          email: "s@s.com",
          first_name: "S",
          last_name: "S",
          metadata: { is_super_admin: true },
        })

        await remoteLink.create([
          { [Modules.USER]: { user_id: adminA.id }, franchise: { franchise_id: fa.id } },
          { [Modules.USER]: { user_id: adminB.id }, franchise: { franchise_id: fb.id } },
          { [Modules.USER]: { user_id: adminC.id }, franchise: { franchise_id: fc.id } },
          { [Modules.USER]: { user_id: managerS2.id }, franchise: { franchise_id: fa.id } },
        ])

        // 3. Sales channels via the CANONICAL franchise-sales-channel link.
        //    Franchise C deliberately gets none.
        const scA = await salesChannelModule.createSalesChannels({ name: "Channel A" })
        const scB = await salesChannelModule.createSalesChannels({ name: "Channel B" })
        salesChannelAId = scA.id
        await remoteLink.create([
          { franchise: { franchise_id: fa.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: scA.id } },
          { franchise: { franchise_id: fb.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: scB.id } },
        ])

        // 4. Two branches of franchise A; manager M2 is bound to S2 only.
        const s1 = await franchiseModule.createStoreLocations({ name: "Store 1", code: "BR_A-S1", franchise_id: fa.id })
        const s2 = await franchiseModule.createStoreLocations({ name: "Store 2", code: "BR_A-S2", franchise_id: fa.id })
        await remoteLink.create([
          { [Modules.USER]: { user_id: managerS2.id }, franchise: { store_location_id: s2.id } },
        ])

        // 5. One order per branch, both in franchise A's sales channel.
        const orderS1 = await orderModule.createOrders({
          currency_code: "gbp",
          email: "buyer1@example.com",
          sales_channel_id: scA.id,
          items: [{ title: "Victoria Sponge", quantity: 1, unit_price: 2500 }],
        })
        const orderS2 = await orderModule.createOrders({
          currency_code: "gbp",
          email: "buyer2@example.com",
          sales_channel_id: scA.id,
          items: [{ title: "Lemon Drizzle", quantity: 1, unit_price: 2200 }],
        })
        orderS1Id = orderS1.id
        orderS2Id = orderS2.id
        await remoteLink.create([
          { franchise: { store_location_id: s1.id }, [Modules.ORDER]: { order_id: orderS1.id } },
          { franchise: { store_location_id: s2.id }, [Modules.ORDER]: { order_id: orderS2.id } },
        ])

        const { projectConfig: { http } } = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        const secret = http.jwtSecret as string
        adminAToken = jwt.sign({ actor_id: adminA.id, actor_type: "user" }, secret)
        adminBToken = jwt.sign({ actor_id: adminB.id, actor_type: "user" }, secret)
        adminCToken = jwt.sign({ actor_id: adminC.id, actor_type: "user" }, secret)
        managerS2Token = jwt.sign({ actor_id: managerS2.id, actor_type: "user" }, secret)
        superToken = jwt.sign({ actor_id: superAdmin.id, actor_type: "user" }, secret)
      })

      describe("(a) unauthenticated requests to scoped admin routes → 401", () => {
        const ROUTES = [
          "/admin/orders",
          "/admin/products",
          "/admin/customers",
          "/admin/inventory-items",
          "/admin/reservations",
          "/admin/draft-orders",
        ]

        it.each(ROUTES)("%s rejects a request with no credentials", async (route) => {
          const r = await api.get(route).catch((e: any) => e)
          expect(statusOf(r)).toBe(401)
        })

        it("rejects a request signed with a bogus token", async () => {
          const r = await api
            .get("/admin/orders", H("not-a-real-jwt"))
            .catch((e: any) => e)
          expect(statusOf(r)).toBe(401)
        })
      })

      describe("(b) order scoping via the franchise-sales-channel link", () => {
        it("the owning franchise admin lists exactly its own orders", async () => {
          const res = await api.get("/admin/orders", H(adminAToken))
          expect(res.status).toBe(200)
          const ids = res.data.orders.map((o: any) => o.id)
          expect(ids).toContain(orderS1Id)
          expect(ids).toContain(orderS2Id)
          expect(res.data.count).toBe(2)
        })

        it("a foreign franchise admin gets an EMPTY list, not a global leak", async () => {
          const res = await api.get("/admin/orders", H(adminBToken))
          expect(res.status).toBe(200)
          expect(res.data.orders).toHaveLength(0)
        })

        it("a foreign franchise admin is denied on the order detail route (403)", async () => {
          const r = await api
            .get(`/admin/orders/${orderS1Id}`, H(adminBToken))
            .catch((e: any) => e)
          expect(statusOf(r)).toBe(403)
          expect(bodyOf(r)?.code).toBe("FRANCHISE_ORDER_ACCESS_DENIED")
        })

        it("cannot escape the boundary with a crafted sales_channel_id filter", async () => {
          const res = await api.get(
            `/admin/orders?sales_channel_id[]=${salesChannelAId}`,
            H(adminBToken)
          )
          expect(res.status).toBe(200)
          expect(res.data.orders).toHaveLength(0)
        })

        it("a franchise with NO linked sales channel lists nothing (empty franchise, no leak)", async () => {
          const res = await api.get("/admin/orders", H(adminCToken))
          expect(res.status).toBe(200)
          expect(res.data.orders).toHaveLength(0)
        })

        it("a franchise with NO linked sales channel is denied on the detail route", async () => {
          const r = await api
            .get(`/admin/orders/${orderS1Id}`, H(adminCToken))
            .catch((e: any) => e)
          expect(statusOf(r)).toBe(403)
          expect(bodyOf(r)?.code).toBe("FRANCHISE_NO_SALES_CHANNEL")
        })

        it("the owning admin and a super admin can open the order detail (200)", async () => {
          const own = await api.get(`/admin/orders/${orderS1Id}`, H(adminAToken))
          expect(own.status).toBe(200)
          expect(own.data.order.id).toBe(orderS1Id)

          const sup = await api.get(`/admin/orders/${orderS1Id}`, H(superToken))
          expect(sup.status).toBe(200)
        })
      })

      describe("(c) branch-manager (Tier 2) store isolation", () => {
        it("a manager bound to S2 lists only S2's order", async () => {
          const res = await api.get("/admin/orders", H(managerS2Token))
          expect(res.status).toBe(200)
          const ids = res.data.orders.map((o: any) => o.id)
          expect(ids).toEqual([orderS2Id])
        })

        it("a manager bound to S2 is denied a cross-store order of the SAME franchise (403)", async () => {
          const r = await api
            .get(`/admin/orders/${orderS1Id}`, H(managerS2Token))
            .catch((e: any) => e)
          expect(statusOf(r)).toBe(403)
          expect(bodyOf(r)?.code).toBe("STORE_ORDER_ACCESS_DENIED")
        })

        it("a manager bound to S2 can open their own store's order (200)", async () => {
          const res = await api.get(`/admin/orders/${orderS2Id}`, H(managerS2Token))
          expect(res.status).toBe(200)
          expect(res.data.order.id).toBe(orderS2Id)
        })
      })

      // NOTE: the limiters are in-memory singletons keyed by IP, so all
      // assertions for one endpoint live in a single test case (the budget is
      // not reset between test cases — only between test FILES).
      describe("(d) customer auth rate limiting", () => {
        it("throttles the 6th failed login within 15 minutes (429 + Retry-After)", async () => {
          const attempt = () =>
            api
              .post("/auth/customer/emailpass", {
                email: "nobody@example.com",
                password: "wrong-password",
              })
              .catch((e: any) => e)

          for (let i = 0; i < 5; i++) {
            expect(statusOf(await attempt())).toBe(401)
          }

          const sixth = await attempt()
          expect(statusOf(sixth)).toBe(429)
          expect(bodyOf(sixth)?.code).toBe("RATE_LIMITED")
          expect(
            Number(sixth?.response?.headers?.["retry-after"])
          ).toBeGreaterThan(0)
        })

        it("throttles the 4th registration attempt within an hour (429)", async () => {
          const register = (email: string) =>
            api
              .post("/auth/customer/emailpass/register", {
                email,
                password: "Str0ng-passw0rd!",
              })
              .catch((e: any) => e)

          for (let i = 0; i < 3; i++) {
            const r = await register(`fresh-${i}@example.com`)
            // Successful registrations count too (3/hour budget).
            expect(statusOf(r)).toBeLessThan(429)
          }

          const fourth = await register("fresh-3@example.com")
          expect(statusOf(fourth)).toBe(429)
          expect(bodyOf(fourth)?.code).toBe("RATE_LIMITED")
        })
      })
    })
  },
})
