"use client";

import { useState } from "react";

interface StoreAddressCopyProps {
  address: string;
  className?: string;
}

export function StoreAddressCopy({ address, className = "" }: StoreAddressCopyProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        return;
      }
      throw new Error("Clipboard API not available");
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = address;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title={copied ? "کپی شد" : "کپی آدرس"}
      aria-label="کپی آدرس فروشگاه"
      className={`inline-flex shrink-0 items-center gap-1 text-xs text-white/50 transition-colors hover:text-white ${className}`}
    >
      {copied ? (
        <>
          <svg
            className="size-3.5 text-emerald-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-[11px] text-emerald-400 font-medium">کپی شد</span>
        </>
      ) : (
        <>
          <svg
            className="size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          <span className="text-[11px]">کپی</span>
        </>
      )}
    </button>
  );
}
