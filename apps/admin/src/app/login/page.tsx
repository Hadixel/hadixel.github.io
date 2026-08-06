import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const ctx = await getAdminUser();
  if (ctx) redirect(ctx.admin.mustChangePassword ? "/change-password" : "/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <LoginForm />
    </main>
  );
}
