import { Module } from "@medusajs/framework/utils"
import InboundLeadModuleService from "./service"

export const INBOUND_LEAD_MODULE = "inbound_lead"

export default Module(INBOUND_LEAD_MODULE, {
  service: InboundLeadModuleService,
})
