import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Adds a nullable `metadata` JSONB column to the `franchise` table.
 *
 * The `franchise_ops_settings` key within this column is used by the
 * SettingsPanel UI to persist:
 *   - accepting_immediate_orders (boolean)
 *   - custom_lead_time_hours     (number)
 *   - updated_at                 (ISO timestamp)
 *
 * Using JSONB (not JSON) gives us index support should we later need to query
 * on settings values, e.g. "find all franchises in Kitchen Busy mode".
 */
export class Migration20260608160000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "franchise" add column if not exists "metadata" jsonb null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "franchise" drop column if exists "metadata";`
    );
  }

}
