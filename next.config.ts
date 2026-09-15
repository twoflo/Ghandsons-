import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pdfkit", "postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  eslint: { ignoreDuringBuilds: true },
};

export default config;
