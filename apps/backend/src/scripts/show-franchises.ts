export default async function showFranchises({ container }) {
  const query = container.resolve("query");

  const { data: franchises } = await query.graph({
    entity: "franchise",
    fields: ["id", "name", "code", "is_active"],
  });

  console.log("\n=== ALL FRANCHISES ===\n");
  console.table(franchises);
}

export const config = {
  // No event needed for manual script
};