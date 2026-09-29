# 15: Close the last direct path

**What to build:** the migration is finished and the old structure is removed. No client reaches the database by any route — not at runtime, not at compile time, and not by a type-only import, which is the shape that survives a careless edit. The database package and the forwarding shim are deleted, and the database connection string stops being an input to any build.

**Blocked by:** 08, 09, 10, 11, 12, 13, 14.

**Status:** done

- [x] No file in either client imports the data tier by any means: `grep -rn '@kmodern/db' --include='*.ts' --include='*.tsx' apps packages scripts | wc -l` prints 0, and the same check with a type-only prefix also prints 0
- [x] The data tier exists only in the gateway; the package that forwarded to it is deleted
- [x] Neither app's framework configuration loads the environment file, so the database connection string is not reachable during a build
- [x] Neither app's framework configuration lists the data package among the packages it compiles
- [x] The clients receive the gateway's address as a build input, declared in the build task so the cache keys on it
- [x] A documented example environment names every variable the code reads and labels its tier; the committed root environment file that currently holds the database connection string is not tracked
- [x] The admin panel serves every page route with the same security headers the storefront serves
- [x] The full pipeline is green: typecheck, lint, test, build
- [x] The deviation register carries a row for the admin panel's rendering dialect, with the reason it deliberately differs from the blueprint's table, and an answer to whether it may be copied
