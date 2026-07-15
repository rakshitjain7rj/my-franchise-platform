import { ExecArgs } from "@medusajs/framework/types"

export default async function listContainer({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const pgConnection = container.resolve("__pg_connection__")
  
  logger.info(`Has raw? ${typeof pgConnection.raw}`)
}
