import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const ctx = await getAdminUser();
  if (!ctx) redirect("/login");
  if (!ctx.admin.mustChangePassword) redirect("/");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <ChangePasswordForm email={ctx.admin.email} />
    </main>
  );
}