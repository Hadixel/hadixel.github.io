import type { NextConfig } from "next";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

// Root .env holds DATABASE_URL (packages/db/.env is a symlink to it). Next
// only auto-loads the app-dir .env, so load the monorepo root explicitly so
// build-time prerender + runtime can reach Postgres.
loadDotenv({ path: path.resolve(process.cwd(), "../../.env") });

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
  transpilePackages: ["@kmodern/db", "@kmodern/schema", "@kmodern/adapters", "@kmodern/ui"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "datees.ir",
        port: "",
        pathname: "/uploads/**",
      },
      ...(storagePattern ? [storagePattern] : []),
    ],
  },
};

export default nextConfig;