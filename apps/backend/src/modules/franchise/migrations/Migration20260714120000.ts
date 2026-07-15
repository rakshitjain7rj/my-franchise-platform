import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Add `is_default` to store_location.
 *
 * Marks the franchise's default bakery for first-time storefront visitors
 * who have not yet chosen a store. Application logic enforces at most one
 * default per franchise (sibling flags are cleared on promote).
 */
export class Migration20260714120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "store_location" add column if not exists "is_default" boolean not null default false;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "store_location" drop column if exists "is_default";`
    );
  }
}
