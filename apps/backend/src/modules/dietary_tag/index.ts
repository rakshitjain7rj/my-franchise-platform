import { Module } from "@medusajs/framework/utils"
import DietaryTagModuleService from "./service" // <-- REMOVED THE CURLY BRACES

export const DIETARY_TAG_MODULE = "dietary_tag"

export default Module(DIETARY_TAG_MODULE, {
  service: DietaryTagModuleService,
})