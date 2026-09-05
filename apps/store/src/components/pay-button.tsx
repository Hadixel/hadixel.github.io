"use client";

import { useState } from "react";


export default function PayButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-6">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await fetch(`/api/orders/${orderId}/pay`, { method: "POST" });
            const j = await r.json();
            if (r.ok && j.url) {
              window.location.href = j.url;
              return;
            }
            setError(j.error ?? "خطا در شروع پرداخت");
          } catch {
            setError("خطای شبکه — دوباره تلاش کنید");
          } finally {
            setBusy(false);
          }
        }}
        className="w-full rounded-card bg-flame-700 py-3.5 font-bold text-white hover:bg-flame-600 disabled:opacity-50"
      >
        {busy ? "در حال اتصال به درگاه…" : "پرداخت آنلاین"}
      </button>
      {error && (
        <p className="mt-2 rounded-card border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error} — می‌توانید دوباره تلاش کنید.</p>
      )}
    </div>
  );
}