import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pdfkit", "postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default config;
