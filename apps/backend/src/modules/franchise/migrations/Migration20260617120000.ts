import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Adds the `hours` column to the `franchise` table.
 *
 * This field stores a human-readable closing-time / operational hours label
 * (e.g. "6:00 PM") that is returned by the /store/franchises endpoint and
 * displayed in the location-picker sidebar.
 *
 * The column is nullable so existing rows remain valid until the data is
 * backfilled via the seed-test-franchises script.
 */
export class Migration20260617120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "franchise" add column if not exists "hours" text null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "franchise" drop column if exists "hours";`
    );
  }

}
