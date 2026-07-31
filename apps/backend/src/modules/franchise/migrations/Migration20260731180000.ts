import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Same-day collection policy: default lead time is 0 hours.
 *
 * Cake Break prefers flexible same-day booking; kitchen-busy mode is the
 * lever for temporary longer notice. Existing locations still on the legacy
 * 24h default are lowered to 0 so they match the new product policy.
 * Locations with an intentional non-24 value are left untouched.
 */
export class Migration20260731180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "store_location" alter column "custom_lead_time_hours" set default 0;`
    );
    this.addSql(
      `update "store_location" set "custom_lead_time_hours" = 0 where "custom_lead_time_hours" = 24;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "store_location" alter column "custom_lead_time_hours" set default 24;`
    );
    // Do not restore rows to 24 — ops may have kept 0 intentionally after up().
  }
}
