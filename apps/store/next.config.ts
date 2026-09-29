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
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["@kmodern/schema", "@kmodern/ui"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "datees.ir",
        port: "",
        pathname: "/uploads/**",
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