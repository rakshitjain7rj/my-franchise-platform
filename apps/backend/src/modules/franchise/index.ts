import { Module } from "@medusajs/framework/utils"
import { FranchiseModuleService } from "./service"

export default Module("franchise", {
  service: FranchiseModuleService,
})
