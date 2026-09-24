"use client";

import { useEffect, useRef, useState } from "react";
import { toFaDigits } from "@kmodern/schema";
import { Button, InputOTP, REGEXP_ONLY_DIGITS, Spinner } from "@heroui/react";
import { StatusNotice } from "./status-notice";

export default function OtpModal({ phone, onSuccess, onClose = () => {} }: { phone: string; onSuccess: () => void; onClose?: () => void }) {
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (timer.current) clearInterval(timer.current);
    };
  }, [onClose]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", phone }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "ارسال کد تأیید انجام نشد.");
        return;
      }
      setSent(true);
      setDevCode(json.devCode ?? null);
      setCooldown(60);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => {
        setCooldown((current) => {
          if (current <= 1) {
            if (timer.current) clearInterval(timer.current);
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    } catch {
      setError("خطای شبکه هنگام ارسال کد رخ داد.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify", phone, code }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "کد واردشده صحیح نیست.");
        return;
      }
      onSuccess();
    } catch {
      setError("خطای شبکه هنگام بررسی کد رخ داد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="otp-title"
    >
      <div className="w-full max-w-md rounded-card bg-canvas p-6 shadow-[var(--overlay-shadow)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="otp-title" className="font-display text-xl font-black text-ink">تأیید شماره موبایل</h3>
            <p className="mt-2 text-sm leading-6 text-ash">کد پیامک‌شده به <span dir="ltr">{phone}</span> را وارد کنید.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن" className="flex size-9 shrink-0 items-center justify-center rounded-card text-ash transition-colors hover:bg-plaster hover:text-ink">×</button>
        </div>

        {!sent ? (
          <Button onPress={() => void send()} variant="primary" fullWidth className="mt-6 min-h-11" isDisabled={busy} data-pending={busy || undefined}>
            {busy && <Spinner size="sm" />}
            {busy ? "در حال ارسال…" : "ارسال کد تأیید"}
          </Button>
        ) : (
          <>
            {devCode && (
              <div className="mt-4">
                <StatusNotice tone="info" title="کد محیط توسعه">کد تأیید: <span className="font-code font-bold">{toFaDigits(devCode)}</span></StatusNotice>
              </div>
            )}
            <div className="mt-5 flex flex-col items-center" dir="ltr">
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                value={code}
                onChange={setCode}
                onComplete={() => void verify()}
                placeholder="000000"
                aria-label="کد تأیید شش رقمی"
                className="justify-center"
              >
                <InputOTP.Group className="justify-center">
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <InputOTP.Slot key={index} index={index} className="h-12 w-10 sm:w-12 [&_[data-slot=input-otp-slot-value]]:text-xl" />
                  ))}
                </InputOTP.Group>
              </InputOTP>
              <Button onPress={() => void verify()} variant="primary" className="mt-4 min-h-11 w-full max-w-xs" isDisabled={code.length !== 6 || busy} data-pending={busy || undefined}>
                {busy ? "در حال بررسی…" : "تأیید و ادامه"}
              </Button>
            </div>
            <div className="mt-3 text-center">
              <Button onPress={() => void send()} variant="ghost" size="sm" className="text-sm text-ash hover:text-flame-700" isDisabled={cooldown > 0 || busy}>
                {cooldown > 0 ? `ارسال مجدد تا ${toFaDigits(cooldown)} ثانیه` : "ارسال مجدد کد"}
              </Button>
            </div>
          </>
        )}

        {error && <div className="mt-4"><StatusNotice tone="danger" role="alert">{error}</StatusNotice></div>}
      </div>
    </div>
  );
}
