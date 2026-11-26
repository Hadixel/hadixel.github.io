"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toFaDigits } from "@kmodern/contracts/format";
import { Button, InputOTP, Spinner } from "@heroui/react";
import { OTP_DIGIT_PATTERN, OTP_LENGTH, normalizeOtpCode } from "@/account/lib/otp-code";
import { StatusNotice } from "@/components/status-notice";

export default function OtpModal({ phone, onSuccess, onClose = () => {} }: { phone: string; onSuccess: () => void; onClose?: () => void }) {
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSentPhoneRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const busy = sending || verifying;

  useEffect(() => {
    mountedRef.current = true;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("keydown", onKey);
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, []);

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", phone }),
      });
      const json = await response.json();
      if (!mountedRef.current) return;
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
            if (timer.current) {
              clearInterval(timer.current);
              timer.current = null;
            }
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    } catch {
      if (mountedRef.current) setError("خطای شبکه هنگام ارسال کد رخ داد.");
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [phone]);

  useEffect(() => {
    if (autoSentPhoneRef.current === phone) return;
    autoSentPhoneRef.current = phone;
    void send();
  }, [phone, send]);

  async function verify(submittedCode: string = code) {
    const normalized = normalizeOtpCode(submittedCode);
    if (busy || normalized.length !== OTP_LENGTH) return;
    setVerifying(true);
    setError(null);
    try {
      const response = await fetch("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify", phone, code: normalized }),
      });
      const json = await response.json();
      if (!mountedRef.current) return;
      if (!response.ok) {
        setError(json.error ?? "کد واردشده صحیح نیست.");
        return;
      }
      onSuccess();
    } catch {
      if (mountedRef.current) setError("خطای شبکه هنگام بررسی کد رخ داد.");
    } finally {
      if (mountedRef.current) setVerifying(false);
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

        {sending && !sent && (
          <div className="mt-4 flex items-center gap-2 text-sm text-ash" role="status">
            <Spinner size="sm" />
            <span>در حال ارسال کد تأیید…</span>
          </div>
        )}

        {devCode && (
          <div className="mt-4">
            <StatusNotice tone="info" title="کد محیط توسعه">کد تأیید: <span className="font-code font-bold">{toFaDigits(devCode)}</span></StatusNotice>
          </div>
        )}

        <div className="mt-5 flex flex-col items-center" dir="ltr">
          <InputOTP
            maxLength={OTP_LENGTH}
            pattern={OTP_DIGIT_PATTERN}
            pasteTransformer={normalizeOtpCode}
            value={code}
            onChange={(next) => setCode(normalizeOtpCode(next))}
            onPaste={(event) => {
              const pasted = event.clipboardData?.getData("text/plain") ?? "";
              const normalized = normalizeOtpCode(pasted);
              if (normalized.length === OTP_LENGTH) {
                event.currentTarget.value = normalized;
                setCode(normalized);
              }
            }}
            onComplete={(completed) => void verify(completed)}
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
          <Button onPress={() => void verify()} variant="primary" className="mt-4 min-h-11 w-full max-w-xs" isDisabled={code.length !== OTP_LENGTH || busy} data-pending={verifying || undefined}>
            {verifying ? "در حال بررسی…" : "تأیید و ادامه"}
          </Button>
        </div>

        <div className="mt-3 text-center">
          <Button onPress={() => void send()} variant="ghost" size="sm" className="text-sm text-ash hover:text-flame-700" isDisabled={cooldown > 0 || busy}>
            {sending
              ? "در حال ارسال…"
              : cooldown > 0
                ? `ارسال مجدد تا ${toFaDigits(cooldown)} ثانیه`
                : "ارسال مجدد کد"}
          </Button>
        </div>

        {error && <div className="mt-4"><StatusNotice tone="danger" role="alert">{error}</StatusNotice></div>}
      </div>
    </div>
  );
}
