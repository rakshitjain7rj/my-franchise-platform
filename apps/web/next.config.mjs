import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle for a small Docker runtime image.
  output: "standalone",
  // In a monorepo, trace files from the repo root so hoisted node_modules
  // are included in the standalone output.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
