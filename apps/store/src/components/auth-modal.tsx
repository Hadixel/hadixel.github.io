"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Input, Button } from "@heroui/react";
import OtpModal from "@/components/otp-modal";

const PHONE_RE = /^09\d{9}$/;

/*
 * AuthModal — one shared login/signup flow for header icon and /account.
 * Phone-first: the backend auto-registers on first verified OTP, so a single
 * «ورود / ثبت‌نام» flow replaces separate signup/login. Composes the
 * checkout OTP modal untouched; verification closes the modal and refreshes
 * server components so the header flips to the logged-in link.
 * Escape/outside-click dismissal now comes from the HeroUI Modal contract
 * (the hand-rolled keydown listener and null guard are gone).
 */
export default function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // password path: "check" asks the API which flows this phone has
  const [pwMode, setPwMode] = useState<"none" | "check" | "login" | "set">("none");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = PHONE_RE.test(phone.trim());

  async function checkPasswordFlow() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "hasPassword", phone: phone.trim() }),
      });
      const j = await r.json();
      setPwMode(j.has ? "login" : "set");
    } catch {
      setError("خطای شبکه");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword() {
    if (password.length < 8) { setError("گذرواژه باید حداقل ۸ نویسه باشد"); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: pwMode === "login" ? "loginPassword" : "setPassword", phone: phone.trim(), password }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "خطا"); return; }
      onClose();
      router.refresh();
    } catch {
      setError("خطای شبکه");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container size="md">
        <Modal.Dialog aria-label="ورود یا ثبت‌نام">
          {showOtp ? (
            <Modal.Body className="p-0">
              <OtpModal
                phone={phone.trim()}
                onSuccess={() => {
                  onClose();
                  router.refresh();
                }}
              />
            </Modal.Body>
          ) : pwMode === "none" ? (
            <>
              <Modal.Header className="flex-row items-center justify-between">
                <Modal.Heading className="text-lg font-bold text-ink">ورود / ثبت‌نام</Modal.Heading>
                <Modal.CloseTrigger aria-label="بستن" />
              </Modal.Header>
              <Modal.Body>
                <p className="text-sm leading-6 text-ash">
                  شماره موبایلتان را وارد کنید؛ با تأیید کد، حساب می‌سازید یا وارد می‌شوید.
                </p>
                <div className="mt-5 flex gap-2">
                  <Input
                    autoFocus
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 11)); setError(null); }}
                    inputMode="numeric"
                    dir="ltr"
                    type="text"
                    placeholder="09xxxxxxxxx"
                    aria-label="شماره موبایل"
                    onKeyDown={(e) => { if (e.key === "Enter") { if (valid) setShowOtp(true); else setError("شماره موبایل را کامل وارد کنید (۱۱ رقم، با ۰۹)"); } }}
                    className="h-11 flex-1 text-center"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    onPress={() => (valid ? setShowOtp(true) : setError("شماره موبایل را کامل وارد کنید (۱۱ رقم، با ۰۹)"))}
                    className="h-11 shrink-0 px-6 text-sm font-bold"
                  >
                    ادامه
                  </Button>
                </div>
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                <button
                  type="button"
                  disabled={!valid || busy}
                  onClick={() => { setError(null); void checkPasswordFlow(); }}
                  className="mt-5 text-sm text-ash transition-colors hover:text-flame-800 disabled:opacity-50"
                >
                  ورود با گذرواژه
                </button>
              </Modal.Body>
            </>
          ) : (
            <>
              <Modal.Header className="flex-row items-center justify-between">
                <Modal.Heading className="text-lg font-bold text-ink">
                  {pwMode === "login" ? "ورود با گذرواژه" : "تنظیم گذرواژه"}
                </Modal.Heading>
                <Modal.CloseTrigger aria-label="بستن" />
              </Modal.Header>
              <Modal.Body>
                <p className="text-sm leading-6 text-ash" dir="ltr">
                  {phone}
                </p>
                <Input
                  autoFocus
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  dir="ltr"
                  placeholder="••••••••"
                  aria-label="گذرواژه"
                  onKeyDown={(e) => { if (e.key === "Enter") void submitPassword(); }}
                  className="mt-4 h-11"
                />
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                <Button
                  type="button"
                  variant="primary"
                  isDisabled={busy}
                  onPress={() => void submitPassword()}
                  className="mt-5 h-11 w-full text-sm font-bold"
                >
                  {pwMode === "login" ? "ورود" : "ثبت گذرواژه"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setPwMode("none"); setPassword(""); setError(null); }}
                  className="mt-4 text-sm text-ash transition-colors hover:text-flame-800"
                >
                  بازگشت به ورود با کد
                </button>
              </Modal.Body>
            </>
          )}
        </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
