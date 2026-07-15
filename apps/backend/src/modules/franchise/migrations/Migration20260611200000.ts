import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Adds `latitude`, `longitude`, and `address` columns to the `franchise` table.
 *
 * These fields enable the location-picker map to display real franchise
 * coordinates and addresses instead of relying on hardcoded demo data.
 *
 * All three columns are nullable so existing franchise rows remain valid
 * until geo data is seeded.
 */
export class Migration20260611200000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "franchise" add column if not exists "latitude" real null;`
    );
    this.addSql(
      `alter table if exists "franchise" add column if not exists "longitude" real null;`
    );
    this.addSql(
      `alter table if exists "franchise" add column if not exists "address" text null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "franchise" drop column if exists "latitude";`
    );
    this.addSql(
      `alter table if exists "franchise" drop column if exists "longitude";`
    );
    this.addSql(
      `alter table if exists "franchise" drop column if exists "address";`
    );
  }

}
