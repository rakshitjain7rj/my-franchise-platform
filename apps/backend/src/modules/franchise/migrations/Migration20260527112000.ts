import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260527112000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "franchise" drop constraint if exists "franchise_code_unique";`);
    this.addSql(`create table if not exists "franchise" ("id" text not null, "name" text not null, "code" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "franchise_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_franchise_code_unique" ON "franchise" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_franchise_deleted_at" ON "franchise" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "franchise" cascade;`);
  }

}
