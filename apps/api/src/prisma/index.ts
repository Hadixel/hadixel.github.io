// The gateway's single door to the generated client — §8's "re-export the generated client through
// one index. No other file imports a `generated/` path."
//
// This file is also the data tier's composition root (`createPrismaClient` / `db` below), because
// splitting the two made every consumer write two import lines for one folder and put the one module
// allowed to name `generated/` in a cycle with the module that constructs what it exports. One file,
// one specifier: `from "../prisma/index.js"`.
//
// What that buys is a one-file edit: changing the ORM, the generator version or the output path
// changes this file and nothing else. What enforces it is a rule, not a habit —
// `generated-prisma-outside-data-client-index` in .dependency-cruiser.js runs at severity `error`
// (generated/ is in the graph for exactly this reason), and apps/api/tests/generated-index.test.ts
// adds a second importer and asserts the gate rejects it.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export * from "../generated/prisma/client";
// Enums are re-exported by the generator's own client module today, but the index names them
// directly as well: a generator that stopped doing that would otherwise drop them out of this
// barrel silently, and 14 gateway modules import them flat.
export * from "../generated/prisma/enums";
export * as $Enums from "../generated/prisma/enums";
export { PrismaClient } from "../generated/prisma/client";

/** Options for one client: a URL (or the ambient `DATABASE_URL`) and whether to log. */
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

// The stock lifecycle is deliberately NOT re-exported here. It used to be — a nine-line alias for
// `inventory/inventory.service`, justified by §8 — and the alias drew this folder into a cycle with
// inventory and auth (prisma -> inventory -> auth -> prisma) while nothing in the workspace imported
// it: orders and checkout have always reached for `inventory.service` directly. §8 asks that the
// *generated client* have one index, which is what the lines above are; an alias with no readers is
// not a boundary, it is a second name for one function, and it is what "no cycle at folder scope"
// (§15.1) has to cut here. If a caller needs the lifecycle, the lifecycle has a home: inventory.
