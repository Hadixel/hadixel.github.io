import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

/**
 * Never prerendered: this page answers a question about the caller's session, and a build has no
 * session. Rendering it at build time would call the gateway with no cookie, read the refusal as the
 * gateway being down, and fail the build on a page that is correct at runtime.
 */
export const dynamic = "force-dynamic";


export default async function ChangePasswordPage() {
  const ctx = await getAdminUser();
  if (!ctx) redirect("/login");
  if (!ctx.admin.mustChangePassword) redirect("/");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-plaster px-4">
      <ChangePasswordForm email={ctx.admin.email} />
    </main>
  );
}