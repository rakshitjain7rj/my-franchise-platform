import UserModule from "@medusajs/medusa/user"
import { defineLink } from "@medusajs/framework/utils"
import FranchiseModule from "../modules/franchise"

export default defineLink(UserModule.linkable.user, {
  linkable: FranchiseModule.linkable.franchise,
  isList: true,
})
