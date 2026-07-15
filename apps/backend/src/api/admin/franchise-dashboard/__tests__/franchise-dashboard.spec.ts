import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import jwt from "jsonwebtoken";
import FranchiseUserLink from "../../../../links/franchise-user";

jest.setTimeout(60000);

medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, getContainer, api }) => {
    describe("Franchise Dashboard API - Zero-Trust Security Validation", () => {
      let appContainer;
      let branchAId: string;
      let branchBId: string;
      let adminAToken: string;
      let adminBToken: string;

      beforeEach(async () => {
        appContainer = getContainer();

        // 1. Seed two separate franchises ("Branch A" and "Branch B")
        const franchiseModule = appContainer.resolve("franchise");

        
        const branchA = await franchiseModule.createFranchises({ name: "Branch A", code: "BRANCH_A", is_active: true });
        const branchB = await franchiseModule.createFranchises({ name: "Branch B", code: "BRANCH_B", is_active: true });
        branchAId = branchA.id;
        branchBId = branchB.id;

        // 2. Seed distinct admin users
        const userModule = appContainer.resolve(Modules.USER);
        
        const adminA = await userModule.createUsers({
          email: "adminA@branchA.com",
          first_name: "Admin",
          last_name: "A",
        });

        const adminB = await userModule.createUsers({
          email: "adminB@branchB.com",
          first_name: "Admin",
          last_name: "B",
        });

        console.log("DEBUG branchA:", branchA);
        console.log("DEBUG adminA:", adminA);
        console.log("DEBUG adminB:", adminB);

        // 3. Link Admin A to Branch A, and Admin B to Branch B via 'franchise-user' DML link
        const linkModule = appContainer.resolve("remoteLink");
        await linkModule.create([
          {
            [Modules.USER]: { user_id: adminA.id },
            "franchise": { franchise_id: branchAId },
          },
          {
            [Modules.USER]: { user_id: adminB.id },
            "franchise": { franchise_id: branchBId },
          }
        ]);

        const remoteQuery = appContainer.resolve(ContainerRegistrationKeys.QUERY);
        const { data: linksData } = await remoteQuery.graph({
          entity: FranchiseUserLink.entryPoint,
          fields: ["*"]
        });
        console.log("DEBUG LINKS DATA:", linksData);

        const { data: filterUserIdData } = await remoteQuery.graph({
          entity: FranchiseUserLink.entryPoint,
          fields: ["*"],
          filters: { user_id: adminA.id }
        });
        console.log("DEBUG FILTER user_id:", filterUserIdData);

        try {
          const { data: filterIdData } = await remoteQuery.graph({
            entity: FranchiseUserLink.entryPoint,
            fields: ["*"],
            filters: { id: adminA.id }
          });
          console.log("DEBUG FILTER id:", filterIdData);
        } catch (e: any) {
          console.log("DEBUG FILTER id failed:", e.message);
        }

        try {
          const { data: filterUserData } = await remoteQuery.graph({
            entity: FranchiseUserLink.entryPoint,
            fields: ["*"],
            filters: { user: adminA.id }
          });
          console.log("DEBUG FILTER user:", filterUserData);
        } catch (e: any) {
          console.log("DEBUG FILTER user failed:", e.message);
        }

        try {
          const pgConnection = appContainer.resolve(ContainerRegistrationKeys.PG_CONNECTION);
          console.log("DEBUG TEST DB NAME:", pgConnection?.client?.connectionParameters?.database);
        } catch (e: any) {
          console.log("DEBUG TEST DB resolve failed:", e.message);
        }

        const { projectConfig: { http } } = appContainer.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
        const jwtSecret = http.jwtSecret;

        adminAToken = jwt.sign({ actor_id: adminA.id, actor_type: "user" }, jwtSecret);
        adminBToken = jwt.sign({ actor_id: adminB.id, actor_type: "user" }, jwtSecret);
      });

      describe("1. Unauthenticated Rejection", () => {
        it("should return 401 Unauthorized without any authorization headers or session tokens", async () => {
          const error = await api
            .get("/admin/franchise-dashboard")
            .catch((e) => e);

          expect(error.response?.status).toBe(401);
          // Additional checks to ensure error message matches security expectations
          expect(error.response?.data?.message).toBe("Unauthorized");
        });
      });

      describe("2. Tenant Isolation & Unauthorized Access (Cross-Tenant Leak Guard)", () => {
        it("should return 403 Forbidden when Admin A attempts to access Branch B metrics", async () => {
          // Admin A attempts to access Branch B by passing malicious query parameters or headers
          const error = await api
            .get(`/admin/franchise-dashboard?franchise_id=${branchBId}`, {
              headers: {
                Authorization: `Bearer ${adminAToken}`,
                "x-franchise-id": branchBId, // Cross-tenant injection attempt
              },
            })
            .catch((e) => e);

          console.log("DEBUG TEST 2:", {
            status: error.status || error.response?.status,
            message: error.message,
            data: error.data || error.response?.data,
          });

          // Assert the server rejects the request
          expect(error.response?.status).toBe(403);
          // Additional checks to ensure error message explicitly states forbidden/insufficient access
          expect(error.response?.data?.message).toMatch(/forbidden|unauthorized/i);
        });
      });

      describe("3. Successful Mapped Scoping", () => {
        it("should return 200 OK and payload linked exclusively to Branch A", async () => {
          // Admin A requests their dashboard
          const response = await api.get("/admin/franchise-dashboard", {
            headers: {
              Authorization: `Bearer ${adminAToken}`,
            },
          });

          // Assert successful query
          expect(response.status).toBe(200);

          const payload = response.data;
          
          // Verify the payload is defined and only contains statistics linked to Branch A
          expect(payload).toBeDefined();
          
          // Ensure scoping middleware correctly enforced the tenant context
          expect(payload.franchise).toBeDefined();
          expect(payload.franchise.id).toBe(branchAId);
          expect(payload.franchise.id).not.toBe(branchBId);
          
          // Verify products and stores array exist
          expect(payload.products).toBeDefined();
          expect(payload.stores).toBeDefined();
        });
      });
    });
  },
});
