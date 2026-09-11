import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  images: { remotePatterns: [{ protocol: "https", hostname: "cdn.robinhood.com" }, { protocol: "https", hostname: "pbs.twimg.com" }] },
  webpack: (config) => {
    // WalletConnect pulls optional node-only deps.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
