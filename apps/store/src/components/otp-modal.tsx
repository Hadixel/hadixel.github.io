"use client";

import { useState, useEffect, useRef } from "react";
import { toFaDigits } from "@kmodern/schema";
import { Button, InputOTP, REGEXP_ONLY_DIGITS, Spinner } from "@heroui/react";

export default function OtpModal({ phone, onSuccess }: { phone: string; onSuccess: () => void }) {
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "send", phone }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setError(j.error ?? "خطا در ارسال کد"); return; }
    setSent(true);
    setDevCode(j.devCode ?? null);
    // 60s resend cooldown
    setCooldown(60);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : (clearInterval(timer.current!), 0))), 1000);
  }

  async function verify() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verify", phone, code }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setError(j.error ?? "کد اشتباه"); return; }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-card bg-canvas p-6 shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
        <h3 className="text-lg font-bold">تأیید شماره موبایل</h3>
        <p className="mt-1 text-sm text-ash">برای ادامه، کد پیامک‌شده به {phone} را وارد کنید</p>
        {!sent ? (
          <Button
            onPress={send}
            variant="primary"
            fullWidth
            className="mt-5"
            isDisabled={busy}
            data-pending={busy || undefined}
          >
            {busy && <Spinner size="sm" />}
            {busy ? "در حال ارسال…" : "ارسال کد تأیید"}
          </Button>
        ) : (
          <>
            {devCode && (
              <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                محیط توسعه: کد تأیید «{toFaDigits(devCode)}»
              </div>
            )}
            <div className="mt-4 flex flex-col items-center" dir="ltr">
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                value={code}
                onChange={setCode}
                onComplete={verify}
                placeholder="کد ۶ رقمی"
                className="justify-center"
              >
                {/* InputOTP root stretches to container width; center the slot row inside it */}
                <InputOTP.Group className="justify-center">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTP.Slot key={i} index={i} className="h-12 [&_[data-slot=input-otp-slot-value]]:text-2xl" />
                  ))}
                </InputOTP.Group>
              </InputOTP>
              <Button
                onPress={verify}
                variant="primary"
                className="mt-3 w-72"
                isDisabled={code.length !== 6 || busy}
              >
                {busy ? "در حال بررسی…" : "ورود"}
              </Button>
            </div>
            <div className="mt-3 text-center">
              <Button
                onPress={send}
                variant="ghost"
                size="sm"
                className="text-sm text-ash hover:text-flame-700"
                isDisabled={cooldown > 0 || busy}
              >
                {cooldown > 0 ? `ارسال مجدد تا ${toFaDigits(cooldown)} ثانیه` : "ارسال مجدد کد"}
              </Button>
            </div>
          </>
        )}
        {error && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      </div>
    </div>
  );
}