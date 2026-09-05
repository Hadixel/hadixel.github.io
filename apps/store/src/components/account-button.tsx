"use client";

import { useState } from "react";
import Link from "next/link";
import AuthModal from "./auth-modal";

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/*
 * AccountButton — profile icon on all sizes. Logged in → link to /account.
 * Logged out → opens the shared auth modal (login/signup in one flow).
 * `loggedIn` is resolved server-side in the header.
 */
export default function AccountButton({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);

  if (loggedIn) {
    return (
      <Link
        href="/account"
        aria-label="حساب من"
        className="flex size-9 items-center justify-center rounded-card text-ink transition-colors hover:bg-plaster"
      >
        <UserIcon />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="ورود / ثبت‌نام"
        className="flex size-9 items-center justify-center rounded-card text-ink transition-colors hover:bg-plaster"
      >
        <UserIcon />
      </button>
      <AuthModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
