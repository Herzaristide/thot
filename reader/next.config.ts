import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Image Docker minimale (node server.js), voir Dockerfile
  output: "standalone",
  typedRoutes: true,
  poweredByHeader: false,
};

export default withSerwist(nextConfig);
