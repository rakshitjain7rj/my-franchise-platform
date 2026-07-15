import { ExecArgs } from "@medusajs/framework/types";

export default async function getFranchiseId({ container }: ExecArgs) {
  // Resolve your custom franchise module
  const franchiseService = container.resolve("franchise");

  // Fetch all existing franchises
  const franchises = await franchiseService.listFranchises();

  if (franchises.length > 0) {
    console.log("🎉 Found your Franchise IDs:");
    franchises.forEach(f => {
      console.log(`- Name: ${f.name}  --->  ID: ${f.id}`);
    });
  } else {
    console.log("⚠️ No franchises found! Creating your first one now...");
    
    // Create a default franchise if the table is empty
    const newFranchise = await franchiseService.createFranchises({
      name: "Flagship Cakery",
      code: "FLAGSHIP_01"
    });
    
    console.log(`✅ Created new Franchise!`);
    console.log(`- Name: ${newFranchise.name}  --->  ID: ${newFranchise.id}`);
  }
}