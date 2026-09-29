import type { NextConfig } from "next";
// The root `.env` is no longer read here, and that is the point of the gateway rather than tidiness.
// This config used to load the monorepo root `.env` so that a build-time prerender could reach
// Postgres, and the comment above it said so plainly. The panel no longer has a database connection
// to make — it asks the gateway over HTTP with the operator's cookie — so the only address it needs is
// the gateway's. That is `NEXT_PUBLIC_API_URL`, inlined at build and declared in the `build` task's
// `env` in turbo.json, so it is part of the cache key. Which is strictly better than a file outside
// the app deciding what the app was built against: that made the build's result depend on the
// directory it was run from, and nothing said so.

const nextConfig: NextConfig = {
  transpilePackages: ["@kmodern/schema", "@kmodern/scraper", "@kmodern/ui"],
  allowedDevOrigins: [process.env.ADMIN_DEV_ORIGIN ?? "192.168.70.176", "localhost", "127.0.0.1"],
  // Every panel page now serves the same three headers the storefront serves.
  //
  // They used to apply to `/media/:path*` alone, which is the one route where they matter least: the
  // media tree is images and clips, and framing one is harmless. The pages an operator actually uses —
  // the order list, the product form, the discount editor — served no `X-Frame-Options` and no
  // `Content-Security-Policy` at all, so a link to the panel could be framed for clickjacking and a
  // response could be sniffed. The panel is the surface where one click changes the shop's money, which
  // is the case these headers are for.
  //
  // The media rule is kept separate and the general one steps around it, rather than both matching and
  // emitting two `Content-Security-Policy` values. Next concatenates duplicate headers with a comma,
  // and a CSP is a space-separated list of directives: the result would be a policy the browser refuses
  // to parse, which is a weaker outcome than either policy alone.
  async headers() {
    return [
      {
        source: "/:path((?!media/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" },
        ],
      },
      {
        source: "/media/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'" },
        ],
      },
    ];
  },
};

export default nextConfig;
