import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260619120600 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "store_location" add column if not exists "stock_location_id" text null, add column if not exists "metadata" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "store_location" drop column if exists "stock_location_id", drop column if exists "metadata";`);
  }
}
