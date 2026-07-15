import { ExecArgs } from "@medusajs/framework/types"

export default async function listTables({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const pgConnection = container.resolve("__pg_connection__")
  
  const tables = await pgConnection.raw(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%franchise%';
  `)
  
  logger.info(`Tables: ${tables.rows.map(r => r.table_name).join(', ')}`)
}
