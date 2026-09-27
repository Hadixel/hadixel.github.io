import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"]!,
    // §8's drift check replays every migration onto an empty database and diffs the result against
    // the schema, which needs a database to replay onto that is not the one being checked. It has
    // to be a separate database on purpose, so the check supplies it and nothing else does.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
