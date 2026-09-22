import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  // /api/card reads its fonts and pre-baked sprites from disk at request time.
  outputFileTracingIncludes: { "/api/card": ["./src/assets/**/*"], "/skill.md": ["./SKILL.md"], "/agents/skill": ["./SKILL.md"], "/docs/[[...slug]]": ["./docs/site/**/*"] },
  // Stock logos (Robinhood), X avatars, and the token numeraires' logos (src/config/tokens.ts, Dexscreener).
  images: { remotePatterns: [{ protocol: "https", hostname: "cdn.robinhood.com" }, { protocol: "https", hostname: "pbs.twimg.com" }, { protocol: "https", hostname: "dd.dexscreener.com" }] },
  webpack: (config) => {
    // WalletConnect pulls optional node-only deps.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
