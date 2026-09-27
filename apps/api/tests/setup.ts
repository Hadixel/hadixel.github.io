// Runs before any test module is imported (vitest `setupFiles`), which matters: the data client
// reads DATABASE_URL when it first connects, so pointing it at the disposable database has to
// happen before a test file imports anything that opens a connection.
//
// DESTRUCTIVE. The suite truncates the schema it runs against. It refuses to run unless the
// variable names the disposable database, because the cost of getting this wrong is real data.

// The reflect-metadata polyfill, loaded here for the same reason `@nestjs/core` loads it for the
// running server. A DTO's decorators run when the module is *imported*, and class-transformer's
// `@Type` calls `Reflect.getMetadata` as it executes — so a test that imports a DTO directly, without
// going anywhere near a Nest bootstrap, hits `Reflect.getMetadata is not a function` before a single
// assertion runs. The app never sees this because `NestFactory` pulls the polyfill in first; a test
// has to be told. It is a declared dependency of this package, so this is the app's own arrangement
// rather than a new one.
import "reflect-metadata";

const DISPOSABLE_MARKER = "kmodern_test";

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error(
    "TEST_DATABASE_URL is not set. These tests are destructive. Boot the disposable database with " +
      "`scripts/test-db.sh start` and export the connection string it prints.",
  );
}
// Compare the parsed database name, not a substring of the whole URL: `includes("kmodern_test")`
// is also satisfied by a password or by a database named `kmodern_test_prod`, and a suite that
// truncates the wrong schema loses real data. The non-default port is checked for the same reason
// §8 names it.
let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  throw new Error(`TEST_DATABASE_URL is not a URL: ${url}`);
}

const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
if (databaseName !== DISPOSABLE_MARKER) {
  throw new Error(
    `TEST_DATABASE_URL must point at the "${DISPOSABLE_MARKER}" database and nothing else. ` +
      `It points at "${databaseName}".`,
  );
}

const port = parsed.port || "5432";
if (port === "5432") {
  throw new Error(
    "TEST_DATABASE_URL must use a non-default port. Port 5432 is the development database's.",
  );
}

// The runtime client reads DATABASE_URL; the suite redirects it at the disposable one.
process.env.DATABASE_URL = url;
