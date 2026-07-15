import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260601131758 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "dietary_tag" drop constraint if exists "dietary_tag_slug_unique";`);
    this.addSql(`create table if not exists "dietary_tag" ("id" text not null, "name" text not null, "slug" text not null, "description" text null, "is_active" boolean not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "dietary_tag_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_dietary_tag_slug_unique" ON "dietary_tag" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dietary_tag_deleted_at" ON "dietary_tag" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "dietary_tag" cascade;`);
  }

}
