import { MedusaService } from "@medusajs/framework/utils"
import Franchise from "./models/franchise"
import StoreLocation from "./models/store_location"

class FranchiseModuleService extends MedusaService({ Franchise, StoreLocation }) {}

export { FranchiseModuleService }
