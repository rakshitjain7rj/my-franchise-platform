import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Creates the `store_location` table inside the franchise module.
 *
 * Each StoreLocation represents a physical bakery that belongs to one Franchise.
 * Key columns:
 *   - `franchise_id`          : FK → franchise.id
 *   - `opening_hours`         : JSONB operating schedule { weekday: { open, close } }
 *   - `daily_order_capacity`  : max orders per 30-min slot
 *   - `stock_location_id`     : Medusa StockLocation ID for inventory cross-reference
 */
export class Migration20260619100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "store_location" (
        "id"                    text          not null,
        "name"                  text          not null,
        "address"               text          null,
        "latitude"              real          null,
        "longitude"             real          null,
        "opening_hours"         jsonb         null,
        "daily_order_capacity"  integer       not null default 10,
        "is_active"             boolean       not null default true,
        "stock_location_id"     text          null,
        "metadata"              jsonb         null,
        "franchise_id"          text          not null,
        "created_at"            timestamptz   not null default now(),
        "updated_at"            timestamptz   not null default now(),
        "deleted_at"            timestamptz   null,
        constraint "store_location_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'store_location_franchise_id_foreign'
        ) THEN
          ALTER TABLE "store_location"
            ADD CONSTRAINT "store_location_franchise_id_foreign"
            FOREIGN KEY ("franchise_id")
            REFERENCES "franchise" ("id")
            ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    this.addSql(`
      create index if not exists "idx_store_location_franchise_id"
        on "store_location" ("franchise_id");
    `);

    this.addSql(`
      create index if not exists "idx_store_location_deleted_at"
        on "store_location" ("deleted_at");
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "store_location" cascade;`);
  }

}
