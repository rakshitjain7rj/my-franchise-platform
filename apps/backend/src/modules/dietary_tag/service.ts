import { MedusaService } from "@medusajs/framework/utils"
import DietaryTag from "./models/dietary_tag"

// EXPLICITLY use the snake_case key "dietary_tag" here:
class DietaryTagModuleService extends MedusaService({
  dietary_tag: DietaryTag,
}) {}

export default DietaryTagModuleService