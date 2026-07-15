const { resolve } = require("path");
const { initialize } = require("@medusajs/framework/utils");

async function run() {
  const { container } = await initialize({ projectConfig: {} }); // This won't work well without full init
}
