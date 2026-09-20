import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  // /api/card reads its fonts and pre-baked sprites from disk at request time.
  outputFileTracingIncludes: { "/api/card": ["./src/assets/**/*"], "/skill.md": ["./SKILL.md"], "/agents/skill": ["./SKILL.md"] },
  images: { remotePatterns: [{ protocol: "https", hostname: "cdn.robinhood.com" }, { protocol: "https", hostname: "pbs.twimg.com" }] },
  webpack: (config) => {
    // WalletConnect pulls optional node-only deps.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
