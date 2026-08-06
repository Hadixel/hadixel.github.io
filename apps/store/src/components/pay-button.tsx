"use client";

import { useState } from "react";

export default function PayButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await fetch(`/api/orders/${orderId}/pay`, { method: "POST" });
          const j = await r.json();
          if (r.ok && j.url) {
            window.location.href = j.url;
            return;
          }
          alert(j.error ?? "خطا در شروع پرداخت");
        } finally {
          setBusy(false);
        }
      }}
      className="mt-6 w-full rounded-full bg-amber-500 py-3.5 font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
    >
      {busy ? "در حال اتصال به درگاه…" : "پرداخت آنلاین"}
    </button>
  );
}