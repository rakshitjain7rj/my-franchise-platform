import { model } from "@medusajs/framework/utils"

/**
 * HeroBanner — home-page carousel slide managed via Medusa Admin.
 *
 * `franchise_id` scopes a slide to one franchise brand. When null the slide
 * is a global default. Storefront resolves franchise-specific rows first,
 * then falls back to globals when none are active for that franchise.
 */
const HeroBanner = model.define("hero_banner", {
  id: model.id({ prefix: "hban" }).primaryKey(),

  /** Small badge above the title (e.g. "Seasonal Special"). */
  tag: model.text(),

  /** Main headline line. */
  title: model.text(),

  /** Optional second line rendered in italic emphasis. */
  title_emphasis: model.text().nullable(),

  /** Supporting copy under the title. */
  description: model.text().nullable(),

  primary_cta_label: model.text(),
  primary_cta_href: model.text(),

  secondary_cta_label: model.text().nullable(),
  secondary_cta_href: model.text().nullable(),

  /** Public image URL (File Module upload or external URL). */
  image_url: model.text(),
  image_alt: model.text().nullable(),

  /** Lower numbers appear first. */
  display_order: model.number().default(0),

  is_active: model.boolean().default(true),

  /**
   * Franchise scope. null = global default banner.
   * Franchise-specific rows override globals for that franchise only.
   */
  franchise_id: model.text().nullable(),
})

export default HeroBanner
