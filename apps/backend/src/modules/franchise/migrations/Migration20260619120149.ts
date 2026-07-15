import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260619120149 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "store_location" add column if not exists "opening_hours" jsonb null, add column if not exists "daily_order_capacity" integer not null default 10, add column if not exists "is_active" boolean not null default true;`);

    this.addSql(`alter table if exists "franchise" add column if not exists "latitude" real null, add column if not exists "longitude" real null, add column if not exists "address" text null, add column if not exists "metadata" jsonb null;`);
  }

  override async down(): Promise<void> {
    // Reverse only the columns added in up() — never drop the whole table, which
    // would destroy all pre-existing store_location rows on a rollback.
    this.addSql(`alter table if exists "store_location" drop column if exists "opening_hours", drop column if exists "daily_order_capacity", drop column if exists "is_active";`);

    this.addSql(`alter table if exists "franchise" drop column if exists "latitude", drop column if exists "longitude", drop column if exists "address", drop column if exists "metadata";`);
  }

}
