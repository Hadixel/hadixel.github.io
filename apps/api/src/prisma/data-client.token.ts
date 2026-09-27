/**
 * The data client's injection token.
 *
 * It lives in its own file, away from the Nest module that provides it, because a token is a name
 * and not a module. Three things follow from that separation, and each was a real cost before:
 *
 * - A feature that injects the client imports this one-line module rather than `prisma.module.ts`,
 *   so the import graph records "this feature needs the data client" instead of "this feature needs
 *   the data tier's Nest wiring".
 * - The token is importable without pulling in `@nestjs/common`'s decorators, which is what lets a
 *   unit test construct a service directly. Importing the module instead fails to parse under the
 *   test runner's transform, because the runner does not compile decorator syntax.
 * - Renaming or re-homing the module never forces a change to every feature that names the token.
 *
 * An explicit token rather than the class is deliberate: `emitDecoratorMetadata` cannot emit a
 * runtime reference for `ReturnType<typeof db>` — a type-only construct — so constructor injection
 * by type resolves to nothing and Nest reports the dependency as `(?)`, injecting `undefined`. That
 * failure is silent: the graph builds, the service constructs, and the first query throws.
 */
export const DATA_CLIENT = "DATA_CLIENT";
