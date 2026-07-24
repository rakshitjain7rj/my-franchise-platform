import { MedusaService } from "@medusajs/framework/utils"
import HeroBanner from "./models/hero_banner"

// Snake_case key matches the table/model name so generated methods are
// listHero_banners / createHero_banners / updateHero_banners / deleteHero_banners
// (same convention as product_review / inbound_lead).
class CMSModuleService extends MedusaService({
  hero_banner: HeroBanner,
}) {}

export default CMSModuleService
