import FranchiseModule from "../modules/franchise"
import StoreModule from "@medusajs/medusa/store"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  FranchiseModule.linkable.franchise,
  StoreModule.linkable.store
)
