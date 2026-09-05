"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthModal from "@/components/auth-modal";

/*
 * /account logged-out view: page-level CTA opens the shared auth modal
 * (same one the header profile icon uses). Login flips server state and
 * the logged-in account view replaces this via router.refresh().
 */
export default function AccountLogin() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">حساب من</h1>
      <p className="mt-4 text-ash">برای ورود یا پیگیری سفارشها، وارد حساب شوید.</p>
      <button
        onClick={() => setOpen(true)}
        className="mt-6 inline-block rounded-card bg-flame-700 px-8 py-3 font-semibold text-white transition hover:bg-flame-600"
      >
        ورود / ثبت‌نام
      </button>
      <AuthModal
        open={open}
        onClose={() => { setOpen(false); router.refresh(); }}
      />
    </div>
  );
}
