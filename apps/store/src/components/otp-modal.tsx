"use client";

import { useState, useEffect, useRef } from "react";
import { toFaDigits } from "@kmodern/schema";

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
        <h3 className="text-lg font-bold">ورود به حساب</h3>
        <p className="mt-1 text-sm text-ash">برای ثبت سفارش باید شماره موبایلتان را تأیید کنید ({phone})</p>

        {!sent ? (
          <button onClick={send} disabled={busy} className="mt-5 w-full rounded-card bg-flame-700 py-3 font-semibold text-white hover:bg-flame-600 disabled:opacity-50">
            {busy ? "در حال ارسال…" : "ارسال کد تأیید"}
          </button>
        ) : (
          <>
            {devCode && (
              <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                محیط توسعه: کد تأیید «{toFaDigits(devCode)}»
              </div>
            )}
            <div className="mt-4">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                dir="ltr"
                placeholder="کد ۶ رقمی"
                className="w-full rounded-card border border-fog px-4 py-3 text-center text-2xl outline-none focus:border-flame-700"
              />
              <button onClick={verify} disabled={code.length !== 6 || busy} className="mt-3 w-full rounded-card bg-ink py-3 font-semibold text-white hover:bg-graphite disabled:opacity-50">
                {busy ? "در حال بررسی…" : "ورود"}
              </button>
            </div>
            <div className="mt-3 text-center">
              <button onClick={send} disabled={cooldown > 0 || busy} className="text-sm text-ash hover:text-flame-700 disabled:opacity-50">
                {cooldown > 0 ? `ارسال مجدد تا ${toFaDigits(cooldown)} ثانیه` : "ارسال مجدد کد"}
              </button>
            </div>
          </>
        )}
        {error && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      </div>
    </div>
  );
}