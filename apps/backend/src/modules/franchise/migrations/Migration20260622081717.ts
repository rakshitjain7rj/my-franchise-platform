import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260622081717 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "franchise" drop column if exists "latitude", drop column if exists "longitude", drop column if exists "address";`);

    this.addSql(`alter table if exists "franchise" alter column "is_active" type boolean using ("is_active"::boolean);`);
    this.addSql(`alter table if exists "franchise" alter column "is_active" set default true;`);

    this.addSql(`alter table if exists "store_location" add column if not exists "code" text not null, add column if not exists "is_accepting_orders" boolean not null default true, add column if not exists "custom_lead_time_hours" integer not null default 24;`);
    this.addSql(`alter table if exists "store_location" rename column "stock_location_id" to "stripe_connect_account_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "franchise" add column if not exists "latitude" real null, add column if not exists "longitude" real null, add column if not exists "address" text null;`);

    this.addSql(`alter table if exists "store_location" drop column if exists "code", drop column if exists "is_accepting_orders", drop column if exists "custom_lead_time_hours";`);

    this.addSql(`alter table if exists "store_location" rename column "stripe_connect_account_id" to "stock_location_id";`);
  }

}
