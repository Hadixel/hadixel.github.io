import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Prisma 7 requires a driver adapter. Server-side singleton shared by
// store + admin; DATABASE_URL must be present at runtime.
export interface DBOptions {
  url?: string;
  log?: boolean;
}

export function createPrismaClient(opts: DBOptions = {}): PrismaClient {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log: opts.log ? ["warn", "error"] : undefined,
  });
}

// Lazy global singleton for Next.js (dev hot-reload safe).
const globalForPrisma = globalThis as unknown as { kmodernDb?: PrismaClient };

export function db(): PrismaClient {
  if (!globalForPrisma.kmodernDb) {
    globalForPrisma.kmodernDb = createPrismaClient();
  }
  return globalForPrisma.kmodernDb;
}
