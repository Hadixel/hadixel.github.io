export * from "./generated/prisma/client";
export { PrismaClient } from "./generated/prisma/client";
export * as $Enums from "./generated/prisma/enums";
export { createPrismaClient, db, type DBOptions } from "./client";
// The stock lifecycle lives here, once. It used to exist once per app, and the two copies
// disagreed — §8: re-export through one index, so a caller can never reach a second implementation.
export {
  commitStock,
  recordOrderEvent,
  releaseStock,
  reserveStock,
  restock,
  type OrderEventInput,
  type ReserveWindow,
  type StockLine,
} from "./inventory";
