import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // The reader moved under /apps/reader (plan, Phase 3); old bookmarks keep working.
  async redirects() {
    return [
      { source: "/reader", destination: "/apps/reader", permanent: true },
      { source: "/reader/library", destination: "/apps/reader", permanent: true },
      { source: "/reader/ingest/upload", destination: "/apps/reader/upload", permanent: true },
      { source: "/reader/book/:id/profile", destination: "/apps/reader/book/:id", permanent: true },
      { source: "/reader/book/:id/reader", destination: "/apps/reader/book/:id/read", permanent: true },
      { source: "/reader/book/:id/summary", destination: "/apps/reader/book/:id/summary", permanent: true },
    ];
  },
  // Self-contained server for the Docker image (apps/web/Dockerfile).
  output: "standalone",
  // Monorepo: trace dependencies from the repository root so hoisted node_modules are included.
  outputFileTracingRoot: path.join(__dirname, "../../"),
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
