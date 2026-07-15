import { ExecArgs } from "@medusajs/framework/types"

export default async function listColumns({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const pgConnection = container.resolve("__pg_connection__")
  
  const columns = await pgConnection.raw(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'user_user_franchise_franchise';
  `)
  
  logger.info(`Columns: ${columns.rows.map(r => r.column_name).join(', ')}`)
}
