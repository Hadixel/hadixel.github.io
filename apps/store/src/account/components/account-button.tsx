"use client";

import Link from "next/link";
import AuthModal from "@/account/components/auth-modal";

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
 * Logged out → renders the shared auth modal's real trigger.
 */
export default function AccountButton({ loggedIn }: { loggedIn: boolean }) {
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
    <AuthModal
      onClose={() => undefined}
      triggerLabel="ورود / ثبت‌نام"
      triggerClassName="flex size-9 items-center justify-center rounded-card text-ink transition-colors hover:bg-plaster"
      trigger={<UserIcon />}
    />
  );
}
