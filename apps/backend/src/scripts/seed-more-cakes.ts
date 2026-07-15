import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

export default async function seedMoreCakes({ container }: ExecArgs) {
  const remoteLink = container.resolve("remoteLink");
  const productService = container.resolve(Modules.PRODUCT);

  // Your exact Franchise ID from earlier
  const franchiseId = "01KSMMJ346PVFAN9G0ZNCDZ8E7";

  console.log("🧁 Baking new mock data...");

  try {
    const cakesToCreate = [
      {
        title: "Red Velvet Symphony",
        description: "Three layers of rich red velvet sponge, blanketed in our signature Madagascar vanilla bean cream cheese frosting.",
        options: [{ title: "Size", values: ["6-inch", "8-inch"] }]
      },
      {
        title: "Lemon Drizzle Loaf",
        description: "A zesty, buttery lemon cake drenched in a sweet citrus glaze. Perfect with an afternoon tea.",
        options: [{ title: "Size", values: ["Standard Loaf"] }]
      },
      {
        title: "Midnight Fudge Brownie Cake",
        description: "Decadent, fudgy chocolate brownie layers layered with dark chocolate ganache and chocolate curls.",
        options: [{ title: "Size", values: ["8-inch", "10-inch"] }]
      },
      {
        title: "Matcha Crepe Cake",
        description: "Twenty delicate handmade crepes layered with light, earthy Japanese matcha infused pastry cream.",
        options: [{ title: "Size", values: ["Slice", "Whole Cake"] }]
      }
    ];

    const createdCakes = await productService.createProducts(cakesToCreate);
    
    // Build the exact links needed for Medusa v2 (franchise on the left!)
    const links = createdCakes.map(cake => ({
      franchise: { franchise_id: franchiseId },
      [Modules.PRODUCT]: { product_id: cake.id }
    }));

    await remoteLink.create(links);

    console.log(`✅ Successfully baked and linked ${createdCakes.length} new cakes to your franchise!`);
  } catch (error) {
    console.error("❌ Failed to bake mock data:", error);
  }
}