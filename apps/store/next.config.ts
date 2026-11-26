import type { NextConfig } from "next";
// The same removal as the panel's, for the same reason: the storefront no longer opens Postgres, so
// it does not need the root `.env` at build time. `NEXT_PUBLIC_API_URL` is declared in the `build`
// task's `env`, which is what puts the gateway's address in the cache key.

type RemotePattern = {
  protocol: "http" | "https";
  hostname: string;
  port: string;
  pathname: string;
};

function storageRemotePattern(): RemotePattern | null {
  const value = process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_ENDPOINT;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return {
      protocol: url.protocol.slice(0, -1) as "http" | "https",
      hostname: url.hostname,
      port: url.port,
      pathname: "/**",
    };
  } catch {
    return null;
  }
}

const storagePattern = storageRemotePattern();

const nextConfig: NextConfig = {
  // Next 16 blocks dev requests from any origin not listed here, and the page then renders as
  // static HTML with no JavaScript — which looks like dead buttons rather than an error, since
  // the markup is all there and the navigation is missing only the behaviour. 127.0.0.1 and
  // localhost are the desktop cases; a phone on the tailnet arrives as a 100.x address, so it
  // has to be named explicitly or nothing on the page is clickable.
  // Mirrors the admin's STORE_DEV_ORIGIN/ADMIN_DEV_ORIGIN convention.
  allowedDevOrigins: (process.env.STORE_DEV_ORIGIN ?? "192.168.70.176")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .concat("localhost", "127.0.0.1"),
  transpilePackages: ["@kmodern/contracts", "@kmodern/ui"],
  images: {
    contentDispositionType: "inline",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    dangerouslyAllowSVG: true,
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2592000,
    qualities: [25, 50, 60, 65, 70, 75, 80, 85, 90, 100],
    deviceSizes: [360, 480, 640, 750, 828, 1080],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kmodern.ir",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "kmodern.ir",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "datees.ir",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "schuffel.net",
        port: "",
        pathname: "/wp-content/uploads/**",
      },
      ...(storagePattern ? [storagePattern] : []),
    ],
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" },
      ],
    }];
  },
};

export default nextConfig;