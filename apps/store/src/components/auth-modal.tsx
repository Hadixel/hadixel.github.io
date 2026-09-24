"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal, Input, Button } from "@heroui/react";
import OtpModal from "@/components/otp-modal";

const PHONE_RE = /^09\d{9}$/;

/*
 * AuthModal — one shared login/signup flow for the header and account page.
 * The HeroUI trigger lives inside the Modal root so React Aria receives a
 * real pressable child; the modal owns its open state while the parent only
 * handles the post-close refresh.
 */
export default function AuthModal({
  onClose,
  trigger,
  triggerClassName,
  triggerLabel,
}: {
  onClose: () => void;
  trigger: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [passwordSetupAfterOtp, setPasswordSetupAfterOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pwMode, setPwMode] = useState<"none" | "check" | "login" | "set">("none");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setPhone("");
    setShowOtp(false);
    setPasswordSetupAfterOtp(false);
    setError(null);
    setPwMode("none");
    setPassword("");
    setBusy(false);
  }, [open]);

  const valid = PHONE_RE.test(phone.trim());

  function closeModal() {
    setOpen(false);
    onClose();
  }

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
      if (!r.ok) {
        setError(j.error ?? "خطای شبکه");
        return;
      }
      if (j.has) {
        setPasswordSetupAfterOtp(false);
        setPwMode("login");
      } else {
        setPasswordSetupAfterOtp(true);
        setPwMode("set");
        setShowOtp(true);
      }
    } catch {
      setError("خطای شبکه");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword() {
    if (password.length < 8) {
      setError("گذرواژه باید حداقل ۸ نویسه باشد");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: pwMode === "login" ? "loginPassword" : "setPassword", phone: phone.trim(), password }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "خطا");
        return;
      }
      closeModal();
      router.refresh();
    } catch {
      setError("خطای شبکه");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={open} onOpenChange={(next) => { setOpen(next); if (!next) onClose(); }}>
      <Modal.Trigger aria-label={triggerLabel} className={triggerClassName}>
        {trigger}
      </Modal.Trigger>
      <Modal.Backdrop>
        <Modal.Container size="md">
          <Modal.Dialog aria-label="ورود یا ثبت‌نام">
            {showOtp ? (
              <Modal.Body className="p-0">
                <OtpModal
                  phone={phone.trim()}
                  onClose={closeModal}
                  onSuccess={() => {
                    if (passwordSetupAfterOtp) {
                      setShowOtp(false);
                      setPasswordSetupAfterOtp(false);
                      setPwMode("set");
                      return;
                    }
                    closeModal();
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
                  <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
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
                      className="h-11 min-w-0 flex-1 text-center"
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
                  {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
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
                  <p className="text-sm leading-6 text-ash" dir="ltr">{phone}</p>
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
                  {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
                  <Button
                    type="button"
                    variant="primary"
                    isDisabled={busy}
                    onPress={() => void submitPassword()}
                    className="mt-5 h-11 w-full text-sm font-bold"
                  >
                    {busy ? "در حال بررسی…" : pwMode === "login" ? "ورود" : "ثبت گذرواژه"}
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
