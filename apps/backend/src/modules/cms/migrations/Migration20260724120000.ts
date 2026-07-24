import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Creates the hero_banner table for the CMS module (home-page carousel).
 */
export class Migration20260724120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "hero_banner" (
        "id" text not null,
        "tag" text not null,
        "title" text not null,
        "title_emphasis" text null,
        "description" text null,
        "primary_cta_label" text not null,
        "primary_cta_href" text not null,
        "secondary_cta_label" text null,
        "secondary_cta_href" text null,
        "image_url" text not null,
        "image_alt" text null,
        "display_order" integer not null default 0,
        "is_active" boolean not null default true,
        "franchise_id" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "hero_banner_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_hero_banner_deleted_at" ON "hero_banner" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_hero_banner_franchise_active" ON "hero_banner" ("franchise_id", "is_active") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_hero_banner_display_order" ON "hero_banner" ("display_order") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "hero_banner" cascade;`)
  }
}
