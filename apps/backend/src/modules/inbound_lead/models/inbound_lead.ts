import { model } from "@medusajs/framework/utils"

/**
 * InboundLead — contact-us and franchise-application form submissions.
 * Persisted for bakery ops follow-up; never trusted as customer auth.
 */
const InboundLead = model.define("inbound_lead", {
  id: model.id({ prefix: "lead" }).primaryKey(),

  /** contact | franchise */
  type: model.enum(["contact", "franchise"]),

  name: model.text(),
  email: model.text(),
  phone: model.text().nullable(),
  message: model.text().nullable(),

  /**
   * Extra fields (city, investment band, preferred area, company name, etc.)
   * stored as JSON so we don't schema-churn per form version.
   */
  metadata: model.json().nullable(),

  /** Optional franchise context when the form was submitted with a cookie. */
  franchise_id: model.text().nullable(),

  status: model.enum(["new", "contacted", "closed"]).default("new"),
})

export default InboundLead
