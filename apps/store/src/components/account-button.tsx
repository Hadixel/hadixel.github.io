"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import AuthModal from "./auth-modal";

function UserIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="7.25" r="4.35" />
      <path d="M20.6 21.4v-2.15a4.35 4.35 0 0 0-4.35-4.35H7.75a4.35 4.35 0 0 0-4.35 4.35v2.15" />
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
      <Button
        isIconOnly
        variant="ghost"
        aria-label="ورود / ثبت‌نام"
        onPress={() => setOpen(true)}
      >
        <UserIcon />
      </Button>
      <AuthModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
