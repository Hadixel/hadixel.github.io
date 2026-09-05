"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import OtpModal from "@/components/otp-modal";

const PHONE_RE = /^09\d{9}$/;

/*
 * AuthModal — one shared login/signup flow for header icon and /account.
 * Phone-first: the backend auto-registers on first verified OTP, so a single
 * «ورود / ثبت‌نام» flow replaces separate signup/login. Composes the
 * checkout OTP modal untouched; verification closes the modal and refreshes
 * server components so the header flips to the logged-in link.
 */
export default function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const valid = PHONE_RE.test(phone.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="ورود یا ثبت‌نام"
    >
      <div
        className="w-full max-w-md rounded-card bg-canvas p-6 shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        {showOtp ? (
          <OtpModal
            phone={phone.trim()}
            onSuccess={() => {
              onClose();
              router.refresh();
            }}
          />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">ورود / ثبت‌نام</h3>
              <button type="button" onClick={onClose} aria-label="بستن" className="rounded-card p-1.5 text-ash hover:bg-plaster hover:text-ink">✕</button>
            </div>
            <p className="mt-2 text-sm leading-6 text-ash">
              شماره موبایلتان را وارد کنید؛ با تأیید کد، حساب می‌سازید یا وارد می‌شوید.
            </p>
            <div className="mt-5 flex gap-2">
              <input
                autoFocus
                value={phone}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 11)); setError(null); }}
                inputMode="numeric"
                dir="ltr"
                placeholder="09xxxxxxxxx"
                aria-label="شماره موبایل"
                onKeyDown={(e) => { if (e.key === "Enter") { if (valid) setShowOtp(true); else setError("شماره موبایل را کامل وارد کنید (۱۱ رقم، با ۰۹)"); } }}
                className="h-11 flex-1 rounded-card border border-fog bg-canvas px-3 text-center text-sm outline-none focus:border-flame-700"
              />
              <button
                type="button"
                onClick={() => (valid ? setShowOtp(true) : setError("شماره موبایل را کامل وارد کنید (۱۱ رقم، با ۰۹)"))}
                className="h-11 shrink-0 rounded-card bg-flame-700 px-6 text-sm font-bold text-white transition hover:bg-flame-600"
              >
                ادامه
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
