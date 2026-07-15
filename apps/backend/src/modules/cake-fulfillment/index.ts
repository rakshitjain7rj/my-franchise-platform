import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import CakeFulfillmentProviderService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [CakeFulfillmentProviderService],
})
