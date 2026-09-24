"use client";

import { useState } from "react";

export function CopyButton({ value, label = "کپی" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={() => void copy()} className="min-h-9 rounded-card border border-fog bg-canvas px-3 text-xs font-bold text-ink transition-colors hover:bg-plaster">
      {copied ? "کپی شد ✓" : label}
    </button>
  );
}
