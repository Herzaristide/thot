import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Image Docker minimale (node server.js), voir Dockerfile
  output: "standalone",
  typedRoutes: true,
  poweredByHeader: false,
  experimental: {
    // Dépôts d'EPUB relayés vers la Corpus API (limite par défaut : 10 Mo)
    proxyClientMaxBodySize: "500mb",
  },
};

export default nextConfig;
