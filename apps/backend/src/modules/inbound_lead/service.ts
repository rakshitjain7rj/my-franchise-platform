import { MedusaService } from "@medusajs/framework/utils"
import InboundLead from "./models/inbound_lead"

class InboundLeadModuleService extends MedusaService({
  inbound_lead: InboundLead,
}) {}

export default InboundLeadModuleService
