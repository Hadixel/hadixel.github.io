import { config } from "dotenv";
import { randomBytes, scryptSync } from "node:crypto";
import { db } from "../src/prisma/index.js";

// The repo keeps one env file at its root; seed scripts run from apps/api, so
// resolve it explicitly rather than relying on the working directory.
config({ path: new URL("../../../.env", import.meta.url) });

// Reset an admin user's password directly in the database.
// The gateway stores passwords as scrypt$salt$hash; this writes the same
// format bootstrap.ts writes. Run:
//   NEW_ADMIN_PASSWORD='<password>' pnpm --filter @kmodern/api db:reset-admin
// Optionally target another user with ADMIN_EMAIL=someone@else.
//
// The floor here is 4 characters, lower than the 12 the API's own password
// change demands (`ADMIN_MIN_PASSWORD` in auth.service.ts). That is deliberate
// and it is not a policy change: this is an operator running a command against
// their own database, on a machine they already hold, where the alternative to
// a short local password is being locked out of a dev environment. The
// application's rule is what guards a password chosen through the app, so a
// short one set here stays settable only here — the app will still refuse to
// *change* to one that short, and login keeps working because it compares
// hashes rather than re-validating length.
const MIN_RESET_PASSWORD = 4;
const email = process.env.ADMIN_EMAIL ?? "owner@kmodern.ir";
const pw = process.env.NEW_ADMIN_PASSWORD;

async function main() {
  if (!pw) throw new Error(`NEW_ADMIN_PASSWORD env required (min ${MIN_RESET_PASSWORD} chars)`);
  if (pw.length < MIN_RESET_PASSWORD) throw new Error(`NEW_ADMIN_PASSWORD too short (min ${MIN_RESET_PASSWORD})`);

  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  const passwordHash = `scrypt$${salt}$${hash}`;

  const prisma = db();
  const user = await prisma.adminUser.update({
    where: { email },
    // The owner chose this password themselves, so no forced change on login.
    data: { passwordHash, mustChangePassword: false },
    select: { email: true, role: true },
  });
  console.log(`password reset for ${user.email} (${user.role}) — sign in at /auth/password`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
