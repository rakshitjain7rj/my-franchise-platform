import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

export default async function assignAdminToFranchise({ container }: ExecArgs) {
  // Resolve the remoteLink service from the Medusa container
  const remoteLink = container.resolve("remoteLink");

  // ⚠️ REPLACE THESE WITH YOUR ACTUAL DATABASE IDs
  // You can find these in your pgAdmin or psql console
  const adminUserId = "user_01KSMM2EFYYVV3H3H5PSK69A13"; 
  const franchiseId = "01KSMMJ346PVFAN9G0ZNCDZ8E7";

  console.log(`Starting mapping process...`);
  console.log(`Linking Admin: ${adminUserId}`);
  console.log(`To Franchise:  ${franchiseId}`);

  try {
    // Create the relational link between the User module and your custom Franchise module
    await remoteLink.create({
      [Modules.USER]: { user_id: adminUserId },
      "franchise": { franchise_id: franchiseId }
    });

    console.log("✅ Successfully mapped admin to franchise! The dashboard is now unlocked.");
  } catch (error) {
    console.error("❌ Failed to map admin to franchise:", error);
  }
}
