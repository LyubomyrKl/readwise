import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "m.media-amazon.com",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "5173",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps in CI/production builds
  silent: !process.env.CI,

  // Upload source maps for better stack traces
  widenClientFileUpload: true,

  // Route browser requests to Sentry through Next.js to avoid ad-blockers
  tunnelRoute: "/monitoring",

  // Automatically tree-shake Sentry in production builds
  disableLogger: true,

  // Automatically instrument React components and server components
  automaticVercelMonitors: true,
});
