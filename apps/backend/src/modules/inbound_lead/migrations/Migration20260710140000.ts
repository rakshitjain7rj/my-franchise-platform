import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260710140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "inbound_lead" (
        "id" text not null,
        "type" text check ("type" in ('contact', 'franchise')) not null,
        "name" text not null,
        "email" text not null,
        "phone" text null,
        "message" text null,
        "metadata" jsonb null,
        "franchise_id" text null,
        "status" text check ("status" in ('new', 'contacted', 'closed')) not null default 'new',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "inbound_lead_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_inbound_lead_deleted_at" ON "inbound_lead" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_inbound_lead_type_status" ON "inbound_lead" ("type", "status") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_inbound_lead_email" ON "inbound_lead" ("email") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "inbound_lead" cascade;`)
  }
}
