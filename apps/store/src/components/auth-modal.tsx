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

  const valid = PHONE_RE.test(phone.trim());

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
          ) : (
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
              </Modal.Body>
            </>
          )}
        </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
