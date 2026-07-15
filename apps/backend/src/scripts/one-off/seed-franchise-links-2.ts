export default async function seedFranchiseLinks({ container }) {
  const query = container.resolve("query");
  const remoteLink = container.resolve("remoteLink");

  console.log("🔗 Starting Franchise-Product Linking...");

  const targetFranchiseId = "01KVA1YYMGRBTV46R63QDT0FW0"; // Cakery Amritsar

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title"],
    filters: { status: "published" },
  });

  console.log(`Found ${products.length} published products.`);

  let linkedCount = 0;

  for (const product of products) {
    try {
      // Better way - use create if not exists
      await remoteLink.create({
        franchise: targetFranchiseId,
        product: product.id,
      });
      linkedCount++;
      console.log(`✅ Linked: ${product.title}`);
    } catch (err: any) {
      if (err.message.includes("already exists") || err.message.includes("duplicate")) {
        console.log(`⏭️ Already linked: ${product.title}`);
      } else {
        console.error(`❌ Failed for ${product.title}:`, err.message);
      }
    }
  }

  console.log(`\n🎉 Done! ${linkedCount} products linked to Amritsar Franchise`);
}

export const config = {};