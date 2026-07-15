import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Creates the product_review table for storefront reviews + admin moderation.
 */
export class Migration20260710120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "product_review" (
        "id" text not null,
        "rating" integer not null,
        "title" text null,
        "content" text not null,
        "nickname" text not null,
        "customer_id" text null,
        "email" text null,
        "status" text check ("status" in ('pending', 'approved', 'rejected')) not null default 'pending',
        "is_verified_purchase" boolean not null default false,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "product_review_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_review_deleted_at" ON "product_review" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_review_status" ON "product_review" ("status") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_product_review_customer_id" ON "product_review" ("customer_id") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product_review" cascade;`)
  }
}
