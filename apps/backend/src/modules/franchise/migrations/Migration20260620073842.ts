import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260620073842 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "store_location" add column if not exists "code" text not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "store_location" drop column if exists "code";`);
  }

}
