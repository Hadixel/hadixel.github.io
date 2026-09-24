"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { StatusNotice } from "./status-notice";

export default function PayButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-6">
      <Button
        variant="primary"
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            const response = await fetch(`/api/orders/${orderId}/pay`, { method: "POST" });
            const json = await response.json();
            if (response.ok && json.url) {
              window.location.href = json.url;
              return;
            }
            setError(json.error ?? "شروع پرداخت انجام نشد.");
          } catch {
            setError("خطای شبکه رخ داد.");
          } finally {
            setBusy(false);
          }
        }}
        isDisabled={busy}
        className="min-h-12 w-full"
      >
        {busy ? "در حال اتصال به درگاه…" : "پرداخت آنلاین"}
      </Button>
      {error && <div className="mt-3"><StatusNotice tone="danger" role="alert">{error} — می‌توانید دوباره تلاش کنید.</StatusNotice></div>}
    </div>
  );
}
