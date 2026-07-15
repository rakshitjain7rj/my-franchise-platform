import { model } from "@medusajs/framework/utils"

const DietaryTag = model.define("dietary_tag", {
  id: model.id().primaryKey(),
  name: model.text(),
  slug: model.text().unique(),
  description: model.text().nullable(),
  is_active: model.boolean(),
})

export default DietaryTag