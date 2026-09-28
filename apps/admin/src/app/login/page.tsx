import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

/**
 * Never prerendered: this page answers a question about the caller's session, and a build has no
 * session. Rendering it at build time would call the gateway with no cookie, read the refusal as the
 * gateway being down, and fail the build on a page that is correct at runtime.
 */
export const dynamic = "force-dynamic";


export default async function LoginPage() {
  const ctx = await getAdminUser();
  if (ctx) redirect(ctx.admin.mustChangePassword ? "/change-password" : "/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <LoginForm />
    </main>
  );
}
